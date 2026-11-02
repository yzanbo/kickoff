import {
  createSdkMcpServer,
  query,
  tool,
  type CanUseTool,
  type Options,
  type Query,
  type SDKResultMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { errorMessage } from "../errors.js";
import { KICKOFF_SERVER_NAME } from "../kickoffTools.js";
import { EFFORT_LEVELS, type EffortLevel, type ModelOption, type PlanUsage, type ProviderStatus, type SlashCommandOption } from "../types.js";
import { agentEnv, resolveClaudeExecutable } from "./claudeEnv.js";
import { emitSdkMessage } from "./claudeMessages.js";
import { resolvePermissionMode, runHooks, toAllowedTools } from "./claudePolicy.js";
import type { SelfInfo } from "../selfProtection.js";
import { normalizeUsage } from "./claudeUsage.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult } from "./types.js";
import { execFileAsync } from "../exec.js";

/** ターミナルの画面でしか意味のないコマンド（Kickoff の画面には同じ働きのものがあるか、使えない）。チャット欄の / には出さない */
const TERMINAL_ONLY_COMMANDS = new Set([
  "exit",
  "quit",
  "vim",
  "theme",
  "terminal-setup",
  "statusline",
  "ide",
  "login",
  "logout",
  "upgrade",
  "doctor",
  "resume",
  "config",
  "help",
  "bug",
  "feedback",
  "model",
  "permissions",
  "hooks",
  "agents",
  "mcp",
  "memory",
  "status",
  "privacy-settings",
  "release-notes",
  "keybindings",
  "rewind",
  "export",
  // 見た目・調査用（ターミナルだけ）
  "color",
  "heapdump",
  // Kickoff の画面に同じものがある（推論の深さ・ファストモード・名前の変更）
  "effort",
  "fast",
  "rename",
]);

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
    const mcp = createSdkMcpServer({
      name: KICKOFF_SERVER_NAME,
      version: "1.0.0",
      tools: params.tools.map((t) =>
        tool(
          t.name,
          t.description,
          t.schema,
          async (args) => {
            try {
              return { content: [{ type: "text" as const, text: await t.handler(args as Record<string, unknown>) }] };
            } catch (e) {
              return { content: [{ type: "text" as const, text: errorMessage(e) }], isError: true };
            }
          },
          { annotations: { readOnlyHint: t.readOnly } },
        ),
      ),
    });

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    const canUseTool: CanUseTool = async (toolName, input, opts) => {
      // AskUserQuestion: Claude からの質問をユーザーに回答してもらう
      if (toolName === "AskUserQuestion") {
        const decision = await cb.requestApproval(
          { kind: "question", toolName, input, title: opts.title, canRemember: false },
          opts.signal,
        );
        if (decision.action === "answer") {
          return {
            behavior: "allow",
            updatedInput: { ...input, answers: decision.answers, ...(decision.response ? { response: decision.response } : {}) },
          };
        }
        return { behavior: "deny", message: decision.action === "deny" && decision.message ? decision.message : "ユーザーは質問への回答をスキップしました" };
      }

      const decision = await cb.requestApproval(
        {
          kind: "permission",
          toolName,
          input,
          title: opts.title,
          description: opts.description ?? opts.decisionReason,
          canRemember: !opts.suppressAlwaysAllowRule && (opts.suggestions?.length ?? 0) > 0,
        },
        opts.signal,
      );
      switch (decision.action) {
        case "allow":
          return { behavior: "allow", updatedInput: input };
        case "allow_always":
          // 提案された許可ルールを適用（localSettings ならリポジトリの .claude/settings.local.json に保存される）
          return { behavior: "allow", updatedInput: input, updatedPermissions: opts.suggestions ?? [] };
        case "deny":
          return { behavior: "deny", message: decision.message || "ユーザーが拒否しました" };
        default:
          return { behavior: "deny", message: "不正な応答です" };
      }
    };

    let sessionId = params.resumeSessionId;
    let final: SDKResultMessage | undefined;
    // メインのエージェントの最後の応答で、コンテキストに入っていたトークン数
    let contextTokens: number | undefined;

    try {
      const q = query({
        prompt: params.prompt,
        options: {
          cwd: params.cwd,
          additionalDirectories: params.additionalDirectories,
          model: params.model || undefined,
          effort: params.effort ?? params.policy.effort,
          systemPrompt: { type: "preset", preset: "claude_code", append: params.systemPrompt },
          // ユーザーの ~/.claude（CLAUDE.md・スキル等）とリポジトリの設定を Claude Code と同様に読み込む
          settingSources: ["user", "project", "local"],
          permissionMode: resolvePermissionMode(params),
          allowedTools: toAllowedTools(params.policy, params.tools),
          mcpServers: { [KICKOFF_SERVER_NAME]: mcp },
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

      for await (const msg of q) {
        const sid = emitSdkMessage(msg, cb);
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
      if (signal.aborted) return { status: "cancelled", sessionId };
      return { status: "failed", sessionId, error: errorMessage(e) };
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    if (signal.aborted) return { status: "cancelled", sessionId };
    if (!final) return { status: "failed", sessionId, error: "エージェントが結果を返さずに終了しました" };

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
    const common = { sessionId: final.session_id ?? sessionId, costUsd: final.total_cost_usd, turns: final.num_turns, context };
    if (final.subtype === "success" && !final.is_error) {
      return { ...common, status: "completed", result: final.result };
    }
    const error =
      final.subtype === "success"
        ? final.result
        : final.errors?.join("\n") || ERROR_LABELS[final.subtype] || final.subtype;
    return { ...common, status: "failed", error };
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

const FAST_MODE_REASONS: Record<string, string> = {
  extra_usage_disabled: "追加の使用枠（extra usage）が無効です",
  model_not_allowed: "このモデルはファストモードに対応していません",
  free: "現在のプランでは使えません",
  preference: "設定で無効になっています",
  not_first_party: "このプロバイダーでは使えません",
  disabled_by_env: "環境変数で無効になっています",
  network_error: "状態を確認できませんでした",
};

const ERROR_LABELS: Record<string, string> = {
  error_max_turns: "最大ターン数に達しました",
  error_max_budget_usd: "予算上限に達しました",
  error_during_execution: "実行中にエラーが発生しました",
};
