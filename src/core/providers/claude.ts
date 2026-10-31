import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import {
  createSdkMcpServer,
  query,
  tool,
  type CanUseTool,
  type SDKMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { KICKOFF_SERVER_NAME, type KickoffTool } from "../kickoffTools.js";
import type { PhasePolicy } from "../phases.js";
import type { ProviderStatus } from "../types.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult } from "./types.js";

const execFileAsync = promisify(execFile);
const TOOL_RESULT_LIMIT = 4000;

/**
 * Agent SDK に同梱される Claude Code のネイティブバイナリを解決する。
 * パッケージ後の Electron では asar の外（app.asar.unpacked）に展開されている必要がある。
 */
export function resolveClaudeExecutable(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
    const bin = path.join(path.dirname(pkg), process.platform === "win32" ? "claude.exe" : "claude");
    return bin.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  } catch {
    return undefined;
  }
}

/**
 * Claude のプラン（claude.ai ログイン）で動かすため、API キーの環境変数は子プロセスに渡さない。
 * KICKOFF_ALLOW_API_KEY=1 のときだけ API キー認証を許可する。
 */
function agentEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "kickoff/0.1.0" };
  if (process.env.KICKOFF_ALLOW_API_KEY !== "1") {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  return env;
}

/** フェーズのポリシーを Claude Code の権限ルールに変換する */
export function toAllowedTools(policy: PhasePolicy, tools: KickoffTool[]): string[] {
  return [
    "Read",
    "Glob",
    "Grep",
    "TodoWrite",
    ...(policy.web ? ["WebSearch", "WebFetch"] : []),
    ...(policy.autoEdit ? ["Edit", "Write", "NotebookEdit"] : []),
    ...policy.allowedCommands.map((cmd) => `Bash(${cmd}:*)`),
    ...tools.map((t) => `mcp__${KICKOFF_SERVER_NAME}__${t.name}`),
  ];
}

export class ClaudeProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Claude Code";
  readonly implemented = true;
  private readonly executable = resolveClaudeExecutable();

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

    try {
      const q = query({
        prompt: params.prompt,
        options: {
          cwd: params.cwd,
          model: params.model || undefined,
          effort: params.policy.effort,
          systemPrompt: { type: "preset", preset: "claude_code", append: params.systemPrompt },
          // ユーザーの ~/.claude（CLAUDE.md・スキル等）とリポジトリの設定を Claude Code と同様に読み込む
          settingSources: ["user", "project", "local"],
          permissionMode: params.policy.autoEdit ? "acceptEdits" : "default",
          allowedTools: toAllowedTools(params.policy, params.tools),
          mcpServers: { [KICKOFF_SERVER_NAME]: mcp },
          canUseTool,
          resume: params.resumeSessionId ?? undefined,
          abortController,
          env: agentEnv(),
          pathToClaudeCodeExecutable: this.executable,
        },
      });

      for await (const msg of q) {
        const sid = this.handleMessage(msg, cb);
        if (sid) sessionId = sid;
        if (msg.type === "result") final = msg;
      }
    } catch (e) {
      if (signal.aborted) return { status: "cancelled", sessionId };
      return { status: "failed", sessionId, error: errorMessage(e) };
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    if (signal.aborted) return { status: "cancelled", sessionId };
    if (!final) return { status: "failed", sessionId, error: "エージェントが結果を返さずに終了しました" };

    const common = { sessionId: final.session_id ?? sessionId, costUsd: final.total_cost_usd, turns: final.num_turns };
    if (final.subtype === "success" && !final.is_error) {
      return { ...common, status: "completed", result: final.result };
    }
    const error =
      final.subtype === "success"
        ? final.result
        : final.errors?.join("\n") || ERROR_LABELS[final.subtype] || final.subtype;
    return { ...common, status: "failed", error };
  }

  /** SDK のメッセージを Kickoff のイベントに変換する。init のときはセッション ID を返す */
  private handleMessage(msg: SDKMessage, cb: ProviderCallbacks): string | undefined {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") {
          cb.emit({ type: "init", session_id: msg.session_id, model: msg.model, permission_mode: msg.permissionMode });
          return msg.session_id;
        }
        return undefined;

      case "assistant": {
        const sub = msg.parent_tool_use_id !== null;
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) {
            cb.emit({ type: "text", text: block.text, ...(sub ? { sub } : {}) });
          } else if (block.type === "tool_use") {
            cb.emit({ type: "tool_use", id: block.id, name: block.name, input: block.input, ...(sub ? { sub } : {}) });
          } else if (block.type === "thinking" && block.thinking.trim()) {
            cb.emit({ type: "thinking", text: block.thinking });
          }
        }
        return undefined;
      }

      case "user": {
        const content = msg.message.content;
        if (typeof content === "string") return undefined;
        for (const block of content) {
          if (block.type !== "tool_result") continue;
          const text =
            typeof block.content === "string"
              ? block.content
              : (block.content ?? [])
                  .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
                  .join("\n");
          cb.emit({
            type: "tool_result",
            tool_use_id: block.tool_use_id,
            content: text.length > TOOL_RESULT_LIMIT ? `${text.slice(0, TOOL_RESULT_LIMIT)}\n…（省略）` : text,
            is_error: Boolean(block.is_error),
          });
        }
        return undefined;
      }

      default:
        return undefined;
    }
  }
}

const ERROR_LABELS: Record<string, string> = {
  error_max_turns: "最大ターン数に達しました",
  error_max_budget_usd: "予算上限に達しました",
  error_during_execution: "実行中にエラーが発生しました",
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
