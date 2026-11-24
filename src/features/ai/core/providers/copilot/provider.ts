import { createRequire } from "node:module";
import os from "node:os";
import type { ProviderUsage } from "@shared/ai/usage";
import { USAGE_QUERY_TIMEOUT_MS } from "@/features/ai/core/providers/shared/usage";
import { noCopilotLogin, normalizeCopilotUsage } from "./usage";
import { errorMessage } from "@shared/foundation/errors";
import type { ProviderCliStatus, ModelOption } from "@shared/ai/types";
import type { AgentProvider, AskModel, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { askModelOf, toModelOptions } from "./catalog";
import { runtimeEnv } from "./config";
import { sdkClientFactory, type CopilotClientFactory, type CopilotClientLike } from "./sdk";
import { runCopilotTurn } from "./turn";
import { CLIENT_INFO } from "@/features/ai/core/providers/shared/process";
import { withTimeout } from "@shared/foundation/time";
import { ASK_TIMEOUT_MS } from "@/features/ai/core/providers/shared/turnLifecycle";


export interface CopilotProviderOpts {
  /** SDK のクライアントの作り方（テストは偽物。省けば本物の SDK） */
  clientFactory?: CopilotClientFactory;
  /** ランタイムに渡す環境変数の元（省けば process.env） */
  env?: Record<string, string | undefined>;
}

/** SDK に同梱のランタイム（@github/copilot-sdk-<OS>-<CPU>）が入っているか */
function bundledRuntimeInstalled(): boolean {
  try {
    createRequire(import.meta.url).resolve(`@github/copilot-sdk-${process.platform}-${process.arch}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/**
 * GitHub Copilot を公式の Copilot SDK（@github/copilot-sdk。SDK に同梱の Copilot のランタイムを JSON-RPC で動かす）で動かすプロバイダー。
 * 会話 = セッション（Kickoff のセッション ID = Copilot のセッション ID）。
 * 分岐は sessions.fork、モデルは listModels。本物のアカウントで確かめるまで、画面では「対応予定」のまま
 * （createProviders が開発用の環境変数のときだけこれを使う）
 */
export class CopilotProvider implements AgentProvider {
  readonly id = "copilot" as const;
  readonly label = "GitHub Copilot";
  readonly implemented = true;
  private readonly factory: CopilotClientFactory;
  private readonly baseEnv: Record<string, string | undefined>;

  constructor(private readonly opts: CopilotProviderOpts = {}) {
    this.factory = opts.clientFactory ?? sdkClientFactory;
    this.baseEnv = opts.env ?? process.env;
  }

  private clientFor(cwd: string): CopilotClientLike {
    return this.factory({ env: runtimeEnv(this.baseEnv, undefined), cwd });
  }

  /** 用事を 1 つ済ませる短いランタイム（Copilot のログインのまま） */
  private async withClient<T>(fn: (client: CopilotClientLike) => Promise<T>, cwd = os.homedir()): Promise<T> {
    const client = this.clientFor(cwd);
    try {
      await client.start();
      return await fn(client);
    } finally {
      await client.stop().catch(() => {});
    }
  }

  async status(): Promise<ProviderCliStatus> {
    const base = { id: this.id, label: this.label, implemented: true };
    if (!this.opts.clientFactory && !bundledRuntimeInstalled()) return { ...base, installed: false, logged_in: false, detail: "Copilot SDK のランタイムが入っていません（npm install をやり直してください）" };
    try {
      const auth = await this.withClient((c) => c.getAuthStatus());
      return {
        ...base,
        installed: true,
        logged_in: auth.isAuthenticated,
        account: auth.login,
        detail: auth.isAuthenticated
          ? `${auth.login ? `${auth.login} で` : ""}ログイン済み${auth.statusMessage ? `（${auth.statusMessage}）` : ""}`
          : "未ログインです。ターミナルで Copilot CLI にログインしてください（`copilot` を起動して /login）",
      };
    } catch (e) {
      return { ...base, installed: true, logged_in: false, detail: `ログイン状態を取得できませんでした: ${errorMessage(e)}` };
    }
  }

  /** チャットと同じ認証でアカウントの枠だけを問い合わせる。会話セッションは作らない */
  async usage(): Promise<ProviderUsage> {
    if (!this.opts.clientFactory && !bundledRuntimeInstalled()) throw new Error("Copilot SDK のランタイムが入っていません");
    const client = this.clientFor(os.homedir());
    const controller = new AbortController();
    const read = async () => {
      await client.start();
      controller.signal.throwIfAborted();
      const auth = await client.getAuthStatus();
      controller.signal.throwIfAborted();
      if (!auth.isAuthenticated) return noCopilotLogin();
      return normalizeCopilotUsage(await client.getQuota(), auth.login ?? null);
    };
    try {
      return await withTimeout(read(), USAGE_QUERY_TIMEOUT_MS, "Copilot が時間内に使用枠を返しませんでした");
    } finally {
      controller.abort();
      // 起動や RPC が詰まった場合も、他のサービスの取得を終了処理で待たせ続けない
      await withTimeout(client.stop(), 1_000, "Copilot の終了が時間内に終わりませんでした").catch(() => {
        void client.forceStop().catch(() => {});
      });
    }
  }

  async models(): Promise<ModelOption[]> {
    return toModelOptions(await this.withClient((c) => c.listModels()).catch(() => []));
  }

  /**
   * ツールを使わずに 1 回だけ聞く: 一時フォルダで（作業場所の指示のファイルを読ませない）、ツールなし（availableTools: []）・承認はすべて断る・
   * 会話の記録をほかのセッションの検索に入れない、で動かし、最後の返答の文を返す。モデルは一覧の値段の倍率で段に当てる（catalog.ts）
   */
  async ask(prompt: string, options?: { model?: AskModel }): Promise<string> {
    const cwd = os.tmpdir();
    return this.withClient(async (client) => {
      const model = askModelOf(await client.listModels().catch(() => []), options?.model ?? "light");
      const session = await client.createSession({
        clientName: CLIENT_INFO.title,
        workingDirectory: cwd,
        availableTools: [],
        enableSessionStore: false,
        onPermissionRequest: () => ({ kind: "reject", feedback: "ツールは使わずに答えてください" }),
        ...(model ? { model } : {}),
      });
      try {
        let text = "";
        let error: string | null = null;
        let finish!: () => void;
        const done = new Promise<void>((resolve) => (finish = resolve));
        session.on((event) => {
          if (event.type === "assistant.message" && !event.data.parentToolCallId && event.data.content.trim()) text = event.data.content;
          if (event.type === "session.error") error = event.data.message;
          if (event.type === "session.idle") finish();
        });
        await session.send({ prompt });
        // 時間内に手が空かなければ、それまでの返答の文を返す（文がなければ失敗）
        await withTimeout(done, ASK_TIMEOUT_MS, "Copilot が時間内に答えませんでした").catch((e: unknown) => {
          error ??= errorMessage(e);
        });
        if (!text && error) throw new Error(error);
        return text.trim();
      } finally {
        await session.disconnect().catch(() => {});
      }
    }, cwd);
  }

  /**
   * 会話を、記録のイベント（messageId = 作業の終わりに覚えた最後のイベントの ID）までで分けた新しいセッションを作る。sessions.fork の境目は
   * 「そのイベントの手前まで」なので、元の会話の記録で messageId の次のイベントを探して渡す（なければすべて写す）。keep は使わない
   */
  async fork(sessionId: string, messageId: string, cwd: string): Promise<string> {
    return this.withClient(async (client) => {
      const source = await client.resumeSession(sessionId, { workingDirectory: cwd, onPermissionRequest: () => ({ kind: "reject" }) });
      let toEventId: string | undefined;
      try {
        const events = await source.getEvents();
        const at = events.findIndex((e) => e.id === messageId);
        if (at < 0) throw new Error("分岐の起点が会話の記録に見つかりません");
        toEventId = events[at + 1]?.id;
      } finally {
        await source.disconnect().catch(() => {});
      }
      return client.forkSession(sessionId, toEventId);
    }, cwd);
  }

  run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
    return runCopilotTurn({ clientFactory: this.factory, baseEnv: this.baseEnv }, params, callbacks, signal);
  }
}
