// Kickoff が AI に出すツールの、コア・画面・スマホが同じに使う名前の形（zod と説明文は置かない）

/** Kickoff が出す MCP サーバー（1 回の実行で渡す順） */
export const AI_TOOL_SERVERS = ["kickoff_browser", "kickoff_db", "kickoff_chat"] as const;
export type AiToolServer = (typeof AI_TOOL_SERVERS)[number];

/** CLI と記録から見える長い名前（mcp__<サーバー>__<ツール>） */
export const aiToolId = (t: Pick<AiToolView, "server" | "name">): string => `mcp__${t.server}__${t.name}`;

/** 画面とスマホに要る、1 つのツールの名前・表示名・記録の行の 1 文（コアの defineAiTool の title は label と同じ値） */
export interface AiToolView {
  server: AiToolServer;
  /** AI から見える短い名前（"notify_user"） */
  name: string;
  /** ツールの行の表示名 */
  label: string;
  /** 行の 1 文（省けば空） */
  describe?: (input: Record<string, unknown>) => string;
}

/** 長い名前（mcp__<サーバー>__<ツール>）の定数から表の 1 行を作る（名前を 2 か所に書かない。Kickoff のツールでなければ投げる） */
export function aiToolViewOf(id: string, label: string, describe?: AiToolView["describe"]): AiToolView {
  const m = /^mcp__(.+?)__(.+)$/.exec(id);
  const server = AI_TOOL_SERVERS.find((s) => s === m?.[1]);
  if (!m || !server) throw new Error(`Kickoff のツールの名前ではありません: ${id}`);
  return { server, name: m[2], label, describe };
}
