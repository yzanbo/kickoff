import type { MCPServerConfig, ProviderConfig, SandboxConfig } from "@github/copilot-sdk";
import type { ToolEndpoint } from "../../mcp/host.js";
import type { ProviderAuth } from "../keys.js";
import type { ProviderTurnParams } from "../types.js";

/**
 * 実行の指定を Copilot SDK の形にする（純粋関数）。利用者の Copilot の設定（~/.copilot）はそのまま読ませ（Claude Code の settingSources と同じ考え）、
 * Kickoff が決めるものだけを渡す
 */

/** MCP のツールの待ち時間（ミリ秒。承認を待つツールのため長く。Claude Code の MCP_TOOL_TIMEOUT と同じ 7 日） */
const COPILOT_MCP_TOOL_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Copilot のランタイムが自分のログインに使う環境変数。ランタイムの環境に入っていると、Copilot のログインの代わりにそれで動く
 * （プロジェクトで選んだ GitHub のアカウントの GH_TOKEN などは Copilot の権限がなく、別のアカウントにもなるため）ので外す。
 * そのため Copilot のチャットの gh・git は、プロジェクトで選んだアカウントでなく gh で有効なアカウントで動く（providers/CLAUDE.md）
 */
const COPILOT_AUTH_VARS = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"];

/** ランタイム（と、そこから動く AI のコマンド）の環境変数 */
export function runtimeEnv(base: Record<string, string | undefined>, extra: Record<string, string> | undefined): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base, ...(extra ?? {}) };
  for (const name of COPILOT_AUTH_VARS) delete env[name];
  return env;
}

/** AI の操作ツール（コアの MCP サーバー）を SDK の mcpServers にする。鍵は見出し（JSON-RPC の中で渡す）で、起動の引数・環境変数には載せない */
export function mcpServersOf(tools: ToolEndpoint[]): Record<string, MCPServerConfig> {
  return Object.fromEntries(tools.map((t): [string, MCPServerConfig] => [t.name, { type: "http", url: t.url, headers: { ...t.headers }, tools: ["*"], timeout: COPILOT_MCP_TOOL_TIMEOUT_MS }]));
}

/**
 * Bash の砂場（Copilot の Seatbelt。SDK では実験的）。書けるのは作業場所と Kickoff の書けるフォルダ（計画モードは何も書かせない）、読むことは絞らない、
 * 通信は絞らない（Kickoff の決まり）。コアの MCP サーバー（127.0.0.1）につなぐので、MCP は砂場に入れない。砂場の外で流す道（allowBypass）は切る
 */
export function copilotSandbox(params: Pick<ProviderTurnParams, "bashSandbox" | "permissionMode">): SandboxConfig | undefined {
  const sandbox = params.bashSandbox;
  if (!sandbox) return undefined;
  const plan = params.permissionMode === "plan";
  return {
    enabled: true,
    addCurrentWorkingDirectory: !plan,
    sandboxMcpServers: false,
    allowBypass: false,
    userPolicy: {
      filesystem: { readwritePaths: plan ? [] : [...sandbox.writableDirs], readonlyPaths: ["/", ...sandbox.readOnlyDirs] },
      network: { allowOutbound: true, allowLocalNetwork: true },
      seatbelt: { keychainAccess: true },
    },
  };
}

/** API キー（BYOK）の種類ごとのつなぎ先と、モデルを選んでいないときのモデル（BYOK ではモデルの指定が要る。名前は使い始める前に確かめる） */
const BYOK_KINDS = {
  anthropic: { provider: { type: "anthropic", baseUrl: "https://api.anthropic.com" }, model: "claude-sonnet-4-5" },
  google: { provider: { type: "google", baseUrl: "https://generativelanguage.googleapis.com" }, model: "gemini-2.5-pro" },
  openai: { provider: { type: "openai", baseUrl: "https://api.openai.com/v1", wireApi: "responses" }, model: "gpt-5" },
} satisfies Record<string, { provider: ProviderConfig; model: string }>;

/**
 * API キーで動かすとき（BYOK。メモの仕様書「0021」の Q13）のつなぎ先。Kickoff が置けるキーは AI ごとに 1 つなので、キーの頭で種類を決める
 * （sk-ant- = Anthropic・AIza = Google・ほか = OpenAI）。キーはセッションの設定で JSON-RPC の中で渡し、環境変数・起動の引数には載せない
 */
export function byokProvider(auth: ProviderAuth | undefined, model: string | null): { provider: ProviderConfig; model: string } | null {
  if (auth?.mode !== "api_key" || !auth.apiKey) return null;
  const key = auth.apiKey;
  const kind = key.startsWith("sk-ant-") ? BYOK_KINDS.anthropic : key.startsWith("AIza") ? BYOK_KINDS.google : BYOK_KINDS.openai;
  return { provider: { ...kind.provider, apiKey: key }, model: model ?? kind.model };
}

/** 送る文（指示に添える文脈があれば先に段落を分けて） */
export function turnPrompt(params: Pick<ProviderTurnParams, "prompt" | "turnContext">): string {
  return params.turnContext ? `${params.turnContext}\n\n${params.prompt}` : params.prompt;
}
