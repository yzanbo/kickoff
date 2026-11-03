import {
  forkSession,
  query,
  type Options,
  type Query,
  type SDKResultMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { errorMessage } from "../errors.js";
import { ERROR_LABELS, FAST_MODE_REASONS, TERMINAL_ONLY_COMMANDS } from "./claudeLabels.js";
import { EFFORT_LEVELS, type EffortLevel, type ModelOption, type PlanUsage, type ProviderStatus, type SlashCommandOption } from "../types.js";
import { createCanUseTool } from "./claudeApprovals.js";
import { agentEnv, resolveClaudeExecutable } from "./claudeEnv.js";
import { createThinkingTimer, emitSdkMessage } from "./claudeMessages.js";
import { runHooks, toAllowedTools } from "./claudePolicy.js";
import type { SelfInfo } from "../selfProtection.js";
import { normalizeUsage } from "./claudeUsage.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult } from "./types.js";
import { execFileAsync } from "../exec.js";

export class ClaudeProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Claude Code";
  readonly implemented = true;
  private readonly executable = resolveClaudeExecutable();

  /** self: エージェントを動かしている Kickoff 自身（自分を壊すツールの呼び出しを断るのに使う） */
  constructor(private readonly self?: SelfInfo) {}

  async status(): Promise<ProviderStatus> {
    const base = { id: this.id, label: this.label, implemented: true };
    if (!this.executable) {
      return { ...base, installed: false, loggedIn: false, detail: "Claude Code のバイナリが見つかりません" };
    }
    try {
      const { stdout } = await execFileAsync(this.executable, ["auth", "status"], { env: agentEnv(), timeout: 20_000 });
      const info = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string; email?: string; subscriptionType?: string };
      return {
        ...base,
        installed: true,
        loggedIn: Boolean(info.loggedIn),
        account: info.email,
        plan: info.subscriptionType,
        detail: info.loggedIn
          ? `${info.authMethod ?? "ログイン済み"}${info.subscriptionType ? `（${info.subscriptionType} プラン）` : ""}`
          : "未ログインです。ターミナルで `claude` を起動してログインしてください",
      };
    } catch (e) {
      return { ...base, installed: true, loggedIn: false, detail: `ログイン状態を取得できませんでした: ${errorMessage(e)}` };
    }
  }

  /**
   * /usage と同じプランの使用枠を取得する。メッセージを送らないセッションを一瞬開くだけなので、
   * モデルへのリクエストは発生しない（使用枠を消費しない）。
   * 注意: SDK 側で EXPERIMENTAL 扱いの API。形が変わったら normalizeUsage を直す。
   */
  async usage(): Promise<PlanUsage> {
    return this.withIdleSession(async (q) =>
      normalizeUsage(await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })),
    );
  }

  /** Claude Code が提示するモデルの一覧（"default" は実体のモデルと重複するので除く） */
  async models(): Promise<ModelOption[]> {
    return this.withIdleSession(async (q) => {
      const models = await q.supportedModels();
      return models
        .filter((m) => m.value !== "default")
        .map((m) => ({
          value: m.value,
          label: m.displayName,
          description: m.description,
          efforts: (m.supportedEffortLevels ?? []).filter((e): e is EffortLevel => EFFORT_LEVELS.includes(e)),
          supportsAutoMode: Boolean(m.supportsAutoMode),
          supportsFastMode: Boolean(m.supportsFastMode),
        }));
    });
  }

  /**
   * チャット欄の / で出すコマンド。プロジェクトの設定（.claude/commands・スキル・プラグイン）も読むよう、cwd とすべての設定を渡す。
   * ターミナルの画面でしか意味のないコマンド（終了・見た目の切り替えなど）は出さない
   */
  async commands(cwd: string): Promise<SlashCommandOption[]> {
    return this.withIdleSession(
      async (q) =>
        (await q.supportedCommands())
          // __ で始まるものは Claude Code の内部用
          .filter((c) => !TERMINAL_ONLY_COMMANDS.has(c.name) && !c.name.startsWith("_"))
          .map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint ?? "" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      { cwd, settingSources: ["user", "project", "local"] },
    );
  }

  /**
   * メッセージを送らないセッションを一瞬開いて、制御用の API だけを呼ぶ。
   * モデルへのリクエストは発生しないので、使用枠を消費しない。
   */
  private async withIdleSession<T>(fn: (q: Query) => Promise<T>, extra: Pick<Options, "cwd" | "settingSources"> = {}): Promise<T> {
    let release!: () => void;
    const idle = new Promise<void>((resolve) => (release = resolve));
    async function* noMessages(): AsyncGenerator<SDKUserMessage> {
      await idle;
    }
    const q = query({
      prompt: noMessages(),
      options: { env: agentEnv(), settingSources: [], pathToClaudeCodeExecutable: this.executable, ...extra },
    });
    try {
      return await fn(q);
    } finally {
      release();
      q.close();
    }
  }

  async run(params: ProviderRunParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderRunResult> {
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    const canUseTool = createCanUseTool(cb);

    let sessionId = params.resumeSessionId;
    let final: SDKResultMessage | undefined;
    // メインのエージェントの最後の応答で、コンテキストに入っていたトークン数
    let contextTokens: number | undefined;
    // メインの会話の最後のメッセージの ID（分岐の位置。結果に残す）
    let lastMessageId: string | undefined;

    try {
      const q = query({
        prompt: params.prompt,
        options: {
          cwd: params.cwd,
          additionalDirectories: params.additionalDirectories,
          model: params.model || undefined,
          // 決めていなければ指定しない（SDK とモデルの既定に任せる）
          effort: params.effort ?? undefined,
          systemPrompt: { type: "preset", preset: "claude_code", append: params.systemPrompt },
          // ユーザーの ~/.claude（CLAUDE.md・スキル等）とリポジトリの設定を Claude Code と同様に読み込む
          settingSources: ["user", "project", "local"],
          permissionMode: params.permissionMode,
          allowedTools: toAllowedTools(params.policy),
          canUseTool,
          resume: params.resumeSessionId ?? undefined,
          abortController,
          env: agentEnv(),
          pathToClaudeCodeExecutable: this.executable,
          hooks: runHooks(params, this.self),
          includePartialMessages: true,
          ...(params.fastMode ? { settings: { fastMode: true } } : {}),
        },
      });

      // 思考の時間を測る（流れてくる途中経過で始まりと終わりを見る）
      const thinkingTimer = createThinkingTimer();
      for await (const msg of q) {
        const sid = emitSdkMessage(msg, cb, thinkingTimer);
        // メインの会話の最後のメッセージ（ここから分岐するときの位置）
        if ((msg.type === "assistant" || msg.type === "user") && msg.parent_tool_use_id === null && msg.uuid) lastMessageId = msg.uuid;
        if (sid) sessionId = sid;
        if (msg.type === "result") final = msg;
        if (msg.type === "assistant" && msg.parent_tool_use_id === null) {
          const u = msg.message.usage;
          contextTokens =
            u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + u.output_tokens;
        }
        // 要約したあとのコンテキストの大きさ（分かるときだけ）
        if (msg.type === "system" && msg.subtype === "compact_boundary" && msg.compact_metadata.post_tokens !== undefined) {
          contextTokens = msg.compact_metadata.post_tokens;
        }
      }
    } catch (e) {
      if (signal.aborted) return { status: "cancelled", sessionId, lastMessageId };
      return { status: "failed", sessionId, error: errorMessage(e), lastMessageId };
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    if (signal.aborted) return { status: "cancelled", sessionId, lastMessageId };
    if (!final) return { status: "failed", sessionId, error: "エージェントが結果を返さずに終了しました", lastMessageId };

    // ファストモードを指定したのに使われなかった場合は、理由をチャットに残す
    if (params.fastMode && final.fast_mode_state !== "on" && final.fast_mode_disabled_reason) {
      cb.emit({
        type: "notice",
        message: `ファストモードは使われませんでした（${FAST_MODE_REASONS[final.fast_mode_disabled_reason] ?? final.fast_mode_disabled_reason}）`,
      });
    }

    // 上限は、使ったモデルのうちいちばん大きいコンテキストウィンドウ（サブエージェントの小さいモデルを除くため）
    const windows = Object.values(final.modelUsage ?? {}).map((m) => m.contextWindow).filter((w) => w > 0);
    const context = contextTokens === undefined ? undefined : { tokens: contextTokens, window: windows.length ? Math.max(...windows) : null };
    const common = { sessionId: final.session_id ?? sessionId, costUsd: final.total_cost_usd, turns: final.num_turns, context, lastMessageId };
    if (final.subtype === "success" && !final.is_error) {
      return { ...common, status: "completed", result: final.result };
    }
    const error =
      final.subtype === "success"
        ? final.result
        : final.errors?.join("\n") || ERROR_LABELS[final.subtype] || final.subtype;
    return { ...common, status: "failed", error };
  }

  /**
   * 会話を messageId の位置までで分け、新しいセッションにする（元のセッションは変えない）。
   * cwd はそのセッションを動かした作業フォルダ（消えていれば、すべてのプロジェクトから探す）
   */
  async fork(sessionId: string, messageId: string, cwd: string): Promise<string> {
    try {
      return (await forkSession(sessionId, { dir: cwd, upToMessageId: messageId })).sessionId;
    } catch {
      return (await forkSession(sessionId, { upToMessageId: messageId })).sessionId;
    }
  }

  /** 最初のメッセージから短いチャット名を作る（軽いモデルで 1 回だけ問い合わせる） */
  async title(text: string): Promise<string> {
    const q = query({
      prompt: `次の依頼内容に、20 文字以内の日本語のタイトルを付けてください。タイトルだけを出力し、記号や引用符は付けないでください。\n\n---\n${text.slice(0, 2000)}`,
      options: {
        model: "haiku",
        effort: "low",
        maxTurns: 1,
        tools: [],
        settingSources: [],
        env: agentEnv(),
        pathToClaudeCodeExecutable: this.executable,
      },
    });
    try {
      let result = "";
      for await (const msg of q) {
        if (msg.type === "result" && msg.subtype === "success") result = msg.result;
      }
      return result.trim().replace(/^["'「『]|["'」』]$/g, "").split("\n")[0].slice(0, 40);
    } finally {
      // 途中で失敗しても Claude Code のプロセスを残さない（withIdleSession と同じ）
      q.close();
    }
  }
}
