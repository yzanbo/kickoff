import type { EffortLevel } from "@shared/types";
import type { ToolEndpoint } from "../../mcp/host.js";
import type { ProviderTurnParams } from "../types.js";
import type { JsonValue, SandboxPolicy, TextInput, ThreadOverrides } from "./protocol.js";

/**
 * 実行の指定を Codex の app-server の形にする（純粋関数）。
 * 利用者の ~/.codex/config.toml はそのまま読ませ（Claude Code の settingSources と同じ考え）、Kickoff が決めるものだけを上書きする
 */

/** MCP のツールの待ち時間（秒。承認を待つツールのため長く。Claude Code の MCP_TOOL_TIMEOUT と同じ 7 日） */
export const CODEX_MCP_TOOL_TIMEOUT_S = 7 * 24 * 60 * 60;

/** Kickoff の推論の深さ → Codex の reasoning effort（Codex に max はないので xhigh。null は指定しない） */
export function codexEffort(effort: EffortLevel | null): string | null {
  if (effort === null) return null;
  return effort === "max" ? "xhigh" : effort;
}

/**
 * AI の操作ツール（コアの MCP サーバー）を、config.toml の mcp_servers.<名前> の上書きにする。鍵は見出し（http_headers）で JSON-RPC の中で渡し、
 * 起動の引数・環境変数には載せない。聞かずに使わせるツールは approval_mode を approve、ほかは Auto mode なら approve・それ以外は prompt（聞く）
 */
export function mcpServerOverrides(tools: ToolEndpoint[], permissionMode: ProviderTurnParams["permissionMode"]): Record<string, JsonValue> {
  const entries = tools.map((t): [string, JsonValue] => [
    `mcp_servers.${t.name}`,
    {
      url: t.url,
      http_headers: { ...t.headers },
      tool_timeout_sec: CODEX_MCP_TOOL_TIMEOUT_S,
      default_tools_approval_mode: permissionMode === "auto" ? "approve" : "prompt",
      tools: Object.fromEntries(t.autoAllow.map((name) => [name, { approval_mode: "approve" }])),
    },
  ]);
  return Object.fromEntries(entries);
}

/** 書けるフォルダ（Bash の砂場の一覧。作業場所は Codex が自分で入れる） */
const writableRootsOf = (params: ProviderTurnParams): string[] => params.bashSandbox?.writableDirs ?? [];

/**
 * Bash とファイルの変更の砂場（Codex の Seatbelt）。計画モードは読むだけ、ほかは作業場所と書けるフォルダ。ネットワークは絞らない（Kickoff の決まり）。
 * Kickoff の砂場の「書かせないフォルダ」（添付・参照資料）は Codex に読めるフォルダとして渡さないので、もともと書けない
 */
export function codexSandboxPolicy(params: ProviderTurnParams): SandboxPolicy {
  if (params.permissionMode === "plan") return { type: "readOnly", networkAccess: true };
  return { type: "workspaceWrite", writableRoots: writableRootsOf(params), networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false };
}

/**
 * thread/start・thread/resume の上書き。承認はいつも untrusted にして Codex に聞かせ、来た承認に Kickoff の守りを当てる（approvals.ts）。
 * システムプロンプトに足す文は developer_instructions（Codex の既定の指示は残す）。API キーで動かすときは、子プロセスから鍵の環境変数を外す既定を強める
 */
export function threadOverrides(params: ProviderTurnParams): ThreadOverrides {
  const apiKey = params.auth?.mode === "api_key";
  return {
    model: params.model,
    cwd: params.cwd,
    approvalPolicy: "untrusted",
    sandbox: params.permissionMode === "plan" ? "read-only" : "workspace-write",
    developerInstructions: params.systemPrompt || null,
    config: {
      ...mcpServerOverrides(params.tools ?? [], params.permissionMode),
      "sandbox_workspace_write.writable_roots": writableRootsOf(params),
      "sandbox_workspace_write.network_access": true,
      ...(apiKey ? { "shell_environment_policy.ignore_default_excludes": false } : {}),
    },
  };
}

/** 指示（指示に添える文脈があれば先に別の塊で） */
export function turnInput(params: Pick<ProviderTurnParams, "prompt" | "turnContext">): TextInput[] {
  const text = (value: string): TextInput => ({ type: "text", text: value, text_elements: [] });
  return [...(params.turnContext ? [text(params.turnContext)] : []), text(params.prompt)];
}

/** API キー・トークンの環境変数（サブスクで動かすときは外し、使った分の支払いにしない） */
const CODEX_KEY_VARS = ["CODEX_API_KEY", "OPENAI_API_KEY", "CODEX_ACCESS_TOKEN"];

/**
 * app-server の起動の引数と環境変数（メモの仕様書「0021」の Q13）。
 * サブスク: Codex のログイン（~/.codex の資格情報）のまま。鍵の環境変数は外す。
 * API キー: CODEX_API_KEY で渡し、forced_login_method="api" で API キーのログインにする。account/login/start の apiKey は使わない
 * （Codex の資格情報の置き場（~/.codex/auth.json）を書き換え、利用者のサブスクのログインを消すため）。鍵の入る変数は、Codex の既定（shell_environment_policy）が
 * コマンドの環境から外す（threadOverrides でその既定を強める）。本物で効くかは使い始める前に確かめる
 */
export function appServerLaunch(
  base: Record<string, string | undefined>,
  params: Pick<ProviderTurnParams, "env" | "auth">,
): { args: string[]; env: Record<string, string | undefined> } {
  const env: Record<string, string | undefined> = { ...base, ...(params.env ?? {}) };
  for (const name of CODEX_KEY_VARS) delete env[name];
  const args = ["app-server"];
  if (params.auth?.mode === "api_key" && params.auth.apiKey) {
    env.CODEX_API_KEY = params.auth.apiKey;
    args.push("-c", 'forced_login_method="api"');
  }
  return { args, env };
}
