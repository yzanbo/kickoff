// Kickoff が AI に出すツールの、コア・画面・スマホが同じに使う名前の形（zod と説明文は置かない）

/** Kickoff が出す MCP サーバー（1 回の実行で渡す順） */
export const AI_TOOL_SERVERS = ["kickoff_browser", "kickoff_db", "kickoff_chat"] as const;
export type AiToolServer = (typeof AI_TOOL_SERVERS)[number];

/** CLI と記録から見える長い名前（mcp__<サーバー>__<ツール>） */
export const aiToolId = (t: { server: AiToolServer; name: string }): string => `mcp__${t.server}__${t.name}`;
