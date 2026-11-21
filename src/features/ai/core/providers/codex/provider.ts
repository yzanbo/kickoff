import os from "node:os";
import { errorMessage } from "@shared/foundation/errors";
import type { ProviderCliStatus, ModelOption } from "@shared/ai/types";
import { findExecutable, runCommand } from "@/foundation/core/system/exec";
import type { AgentProvider, AskModel, ProviderCallbacks, ProviderLogin, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { askModelOf, toModelOptions } from "./catalog";
import { appServerLaunch } from "./config";
import { startChatgptLogin } from "./login";
import type { AccountResponse, CodexModel, ModelListResponse, ThreadForkParams, ThreadItem, ThreadResponse, Turn } from "./protocol";
import { spawnStdio, type StdioSpawn } from "@/features/ai/core/providers/stdioRpc";
import { withSession } from "./session";
import { runCodexTurn } from "./turn";
import { CodexUpdateCheck } from "./update";
import { parseCodexVersion } from "@shared/ai/cliUpdates";
import { ASK_TIMEOUT_MS, withTimeout } from "@/features/ai/core/providers/shared/turnLifecycle";
import { PROVIDERS } from "@shared/ai/providers";

/** モデルの一覧を読む頁の上限（安全のため） */
const MAX_MODEL_PAGES = 5;

export interface CodexProviderOpts {
  /** app-server の起動（テストは偽物。省けば PATH の codex） */
  spawn?: StdioSpawn;
  /** app-server に渡す環境変数の元（省けば process.env） */
  env?: Record<string, string | undefined>;
  /** 入れた codex の新しい版の確かめ（テストは差し替える。省けば Homebrew・npm に 1 日 1 回聞く） */
  updates?: CodexUpdateCheck;
}

/**
 * Codex（OpenAI の Codex CLI）を `codex app-server` の JSON-RPC で動かすプロバイダー。
 * 会話 = スレッド（Kickoff のセッション ID = スレッドの ID）、1 回の実行 = ターン。分岐は thread/fork（ターンの ID まで）、モデルは model/list、
 * 使用枠は account/rateLimits/read、1 回だけ聞くのは一時のスレッド（ephemeral）
 */
export class CodexProvider implements AgentProvider {
  readonly id = "codex" as const;
  readonly label = "Codex";
  readonly implemented = true;
  private readonly executable: string | null;
  private readonly spawn: StdioSpawn | null;
  private readonly baseEnv: Record<string, string | undefined>;
  private readonly updates: CodexUpdateCheck;

  constructor(private readonly opts: CodexProviderOpts = {}) {
    this.updates = opts.updates ?? new CodexUpdateCheck();
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

  async status(): Promise<ProviderCliStatus> {
    const base = { id: this.id, label: this.label, implemented: true };
    if (!this.executable) return { ...base, installed: false, logged_in: false, detail: PROVIDERS.codex.installHint };
    const executable = this.executable;
    const version = this.opts.spawn ? null : await runCommand(executable, ["--version"], { timeout: 5000 }).then(parseCodexVersion, () => null);
    // 新しい版は、ログインの様子と並べて聞く（聞けなくても状態は出す）
    const update = this.updates.of(executable, version).catch(() => null);
    const extra = async () => ({ version, update: await update });
    try {
      const res = await this.session((rpc) => rpc.request<AccountResponse>("account/read", {}));
      const account = res.account;
      const email = account && account.type === "chatgpt" ? ((account as { email: string | null }).email ?? undefined) : undefined;
      const plan = account && account.type === "chatgpt" ? (account as { planType: string }).planType : undefined;
      return {
        ...base,
        ...(await extra()),
        installed: true,
        logged_in: account !== null,
        account: email,
        plan,
        detail: account
          ? `${account.type === "apiKey" ? "API キーでログイン済み" : "ChatGPT でログイン済み"}${plan ? `（${plan} プラン）` : ""}`
          : "未ログインです。Kickoff の設定から ChatGPT でログインするか、ターミナルで `codex login` を流してください",
      };
    } catch (e) {
      return { ...base, ...(await extra()), installed: true, logged_in: false, detail: `ログイン状態を取得できませんでした: ${errorMessage(e)}` };
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
        const turn = await withTimeout(done, ASK_TIMEOUT_MS, "Codex が時間内に答えませんでした");
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
  login(): Promise<ProviderLogin> {
    if (!this.spawn) return Promise.reject(new Error("codex CLI が見つかりません"));
    const { args, env } = appServerLaunch(this.baseEnv, {});
    return startChatgptLogin({ spawn: this.spawn, args, env, cwd: os.homedir() });
  }

  run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
    if (!this.spawn) return Promise.resolve({ status: "failed", sessionId: params.resumeSessionId, error: PROVIDERS.codex.installHint });
    return runCodexTurn({ spawn: this.spawn, baseEnv: this.baseEnv }, params, callbacks, signal);
  }
}
