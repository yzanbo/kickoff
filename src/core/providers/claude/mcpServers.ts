// コアの MCP サーバーの口（ProviderTurnParams.tools）を Claude Code の書き方にする
import type { McpHttpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ToolEndpoint } from "../../mcp/host.js";

/** Claude Code の mcpServers（HTTP でつなぐ。鍵は見出しで渡す） */
export function mcpServersOf(tools: ToolEndpoint[]): Record<string, McpHttpServerConfig> {
  return Object.fromEntries(tools.map((t) => [t.name, { type: "http" as const, url: t.url, headers: t.headers }]));
}

/** allowedTools に足す名前（聞かずに使わせるツール。Claude Code の見え方 mcp__<サーバー>__<ツール>） */
export function toolAllowList(tools: ToolEndpoint[]): string[] {
  return tools.flatMap((t) => t.autoAllow.map((name) => `mcp__${t.name}__${name}`));
}
