import os from "node:os";
import { errorMessage } from "@shared/errors";
import type { ModelOption, PlanUsage, ProviderStatus } from "@shared/types";
import type { SelfInfo } from "../../chat/guard/selfProtection.js";
import { findExecutable, runCommand } from "../../system/exec.js";
import { cleanTitle, summarizePrompt, titlePrompt } from "../askPrompts.js";
import type { AgentProvider, AskModel, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "../types.js";
import { askModelOf, toModelOptions, toPlanUsage } from "./catalog.js";
import { appServerLaunch } from "./config.js";
import { startChatgptLogin, type ChatgptLogin } from "./login.js";
import type { AccountResponse, CodexModel, ModelListResponse, RateLimitsResponse, ThreadForkParams, ThreadItem, ThreadResponse, Turn } from "./protocol.js";
import { spawnStdio, type StdioSpawn } from "../stdioRpc.js";
import { withSession } from "./session.js";
import { runCodexTurn } from "./turn.js";

/** モデルの一覧を読む頁の上限（安全のため） */
const MAX_MODEL_PAGES = 5;
/** 1 回だけ聞くときの待ち時間 */
const ASK_TIMEOUT_MS = 120_000;

export interface CodexProviderOpts {
  self?: SelfInfo;
  /** app-server の起動（テストは偽物。省けば PATH の codex） */
  spawn?: StdioSpawn;
  /** app-server に渡す環境変数の元（省けば process.env） */
  env?: Record<string, string | undefined>;
}

/**
 * Codex（OpenAI の Codex CLI）を `codex app-server` の JSON-RPC で動かすプロバイダー（メモの仕様書「0021_Codex・Copilot・Cursor 対応」の段階 3）。
 * 会話 = スレッド（Kickoff のセッション ID = スレッドの ID）、1 回の実行 = ターン。分岐は thread/fork（ターンの ID まで）、モデルは model/list、
 * 使用枠は account/rateLimits/read、1 回だけ聞くのは一時のスレッド（ephemeral）。本物のアカウントで確かめるまで、画面では「対応予定」のまま
 * （createProviders が開発用の環境変数のときだけこれを使う）
 */
export class CodexProvider implements AgentProvider {
  readonly id = "codex" as const;
  readonly label = "Codex";
  readonly implemented = true;
  private readonly executable: string | null;
  private readonly spawn: StdioSpawn | null;
  private readonly baseEnv: Record<string, string | undefined>;

  constructor(private readonly opts: CodexProviderOpts = {}) {
    this.executable = opts.spawn ? "codex" : findExecutable(["codex"]);
    this.spawn = opts.spawn ?? (this.executable ? spawnStdio(this.executable) : null);
    this.baseEnv = opts.env ?? process.env;
  }

  /** 用事を 1 つ済ませる短い app-server（サブスクのログインのまま） */
  private session<T>(fn: Parameters<typeof withSession<T>>[1], cwd = os.homedir()): Promise<T> {
    if (!this.spawn) return Promise.reject(new Error("codex CLI が見つかりません"));
    const { args, env } = appServerLaunch(this.baseEnv, {});
    return withSession({ spawn: this.spawn, args, env, cwd }, fn);
  }

  async status(): Promise<ProviderStatus> {
    const base = { id: this.id, label: this.label, implemented: true };
    if (!this.executable) return { ...base, installed: false, logged_in: false, detail: "codex CLI が見つかりません（brew install codex）" };
    const version = this.opts.spawn ? null : await runCommand(this.executable, ["--version"], { timeout: 5000 }).then((s) => s.trim().split("\n").at(-1) ?? null, () => null);
    try {
      const res = await this.session((rpc) => rpc.request<AccountResponse>("account/read", {}));
      const account = res.account;
      const email = account && account.type === "chatgpt" ? ((account as { email: string | null }).email ?? undefined) : undefined;
      const plan = account && account.type === "chatgpt" ? (account as { planType: string }).planType : undefined;
      return {
        ...base,
        installed: true,
        logged_in: account !== null,
        account: email,
        plan,
        detail: account
          ? `${account.type === "apiKey" ? "API キーでログイン済み" : "ChatGPT でログイン済み"}${plan ? `（${plan} プラン）` : ""}${version ? ` · ${version}` : ""}`
          : "未ログインです。Kickoff の設定から ChatGPT でログインするか、ターミナルで `codex login` を流してください",
      };
    } catch (e) {
      return { ...base, installed: true, logged_in: false, detail: `ログイン状態を取得できませんでした: ${errorMessage(e)}` };
    }
  }

  /** 隠すものも含めた一覧（ask のモデル選びにも使う） */
  private async catalog(): Promise<CodexModel[]> {
    return this.session(async (rpc) => {
      const all: CodexModel[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_MODEL_PAGES; page++) {
        const res: ModelListResponse = await rpc.request<ModelListResponse>("model/list", { cursor, includeHidden: false });
        all.push(...res.data);
        cursor = res.nextCursor;
        if (!cursor) break;
      }
      return all;
    });
  }

  async models(): Promise<ModelOption[]> {
    return toModelOptions(await this.catalog().catch(() => []));
  }

  async usage(): Promise<PlanUsage> {
    return toPlanUsage(await this.session((rpc) => rpc.request<RateLimitsResponse>("account/rateLimits/read", {})));
  }

  async title(text: string): Promise<string> {
    return cleanTitle(await this.ask(titlePrompt(text)));
  }

  async summarize(text: string): Promise<string> {
    return this.ask(summarizePrompt(text));
  }

  /**
   * ツールを使わずに 1 回だけ聞く: 一時フォルダで（作業場所の AGENTS.md などを読ませない）、一時のスレッド（ephemeral。記録を残さない）・読むだけの砂場・聞かない（never）で動かし、
   * 最後の返答の文を返す。モデルは一覧から段に当てる（catalog.ts の askModelOf）
   */
  async ask(prompt: string, options?: { model?: AskModel }): Promise<string> {
    const { model, effort } = askModelOf(await this.catalog().catch(() => []), options?.model ?? "light");
    const cwd = os.tmpdir();
    if (!this.spawn) throw new Error("codex CLI が見つかりません");
    const { args, env } = appServerLaunch(this.baseEnv, {});
    let text = "";
    let finish!: (turn: Turn) => void;
    const done = new Promise<Turn>((resolve) => (finish = resolve));
    return withSession(
      {
        spawn: this.spawn,
        args,
        env,
        cwd,
        onNotification: (method, raw) => {
          const p = raw as { item?: ThreadItem; turn?: Turn };
          if (method === "item/completed" && p.item?.type === "agentMessage") text = (p.item as Extract<ThreadItem, { type: "agentMessage" }>).text;
          if (method === "turn/completed" && p.turn) finish(p.turn);
        },
        onClosed: (reason) => finish({ id: "", status: "failed", error: { message: reason, codexErrorInfo: null, additionalDetails: null } }),
      },
      async (rpc) => {
        const thread = await rpc.request<ThreadResponse>("thread/start", { model, cwd, ephemeral: true, approvalPolicy: "never", sandbox: "read-only" });
        await rpc.request("turn/start", { threadId: thread.thread.id, input: [{ type: "text", text: prompt, text_elements: [] }], effort });
        const timer = setTimeout(() => finish({ id: "", status: "failed", error: { message: "Codex が時間内に答えませんでした", codexErrorInfo: null, additionalDetails: null } }), ASK_TIMEOUT_MS);
        const turn = await done.finally(() => clearTimeout(timer));
        if (turn.status !== "completed") throw new Error(turn.error?.message ?? "Codex が答えませんでした");
        return text.trim();
      },
    );
  }

  /** 会話をターン（messageId = ターンの ID）までで分けた、新しいスレッドを作る（keep は Codex では使わない。スレッドは Codex が自分で持つ） */
  async fork(sessionId: string, messageId: string, cwd: string): Promise<string> {
    const res = await this.session((rpc) => rpc.request<ThreadResponse>("thread/fork", { threadId: sessionId, lastTurnId: messageId, cwd, excludeTurns: true } satisfies ThreadForkParams), cwd);
    return res.thread.id;
  }

  /** ブラウザでのログインを始める（login.ts。Codex がログインを受けて ~/.codex に書く。設定の「接続」から） */
  login(): Promise<ChatgptLogin> {
    if (!this.spawn) return Promise.reject(new Error("codex CLI が見つかりません"));
    const { args, env } = appServerLaunch(this.baseEnv, {});
    return startChatgptLogin({ spawn: this.spawn, args, env, cwd: os.homedir() });
  }

  run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
    if (!this.spawn) return Promise.resolve({ status: "failed", sessionId: params.resumeSessionId, error: "codex CLI が見つかりません（brew install codex）" });
    return runCodexTurn({ spawn: this.spawn, baseEnv: this.baseEnv, self: this.opts.self }, params, callbacks, signal);
  }
}
