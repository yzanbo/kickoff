// チャットの AI が読むだけのツール（kickoff_chat の list_project_chats・read_chat・get_usage）の、コアと画面で共有する名前・引数・上限と、記録の行に出す文

/** 同じプロジェクトのチャットの一覧を返すツールの名前 */
export const AI_LIST_PROJECT_CHATS_TOOL = "mcp__kickoff_chat__list_project_chats";

/** 同じプロジェクトのほかのチャットの会話を読むツールの名前 */
export const AI_READ_CHAT_TOOL = "mcp__kickoff_chat__read_chat";

/** 使用枠の残りを返すツールの名前 */
export const AI_USAGE_TOOL = "mcp__kickoff_chat__get_usage";

/** read_chat で、turns を省いたときに読むやり取りの数（最後から） */
export const READ_CHAT_DEFAULT_TURNS = 3;

/** read_chat で、1 回に読めるやり取りの数の上限 */
export const READ_CHAT_MAX_TURNS = 10;

/** list_project_chats で返すチャットの数の上限（最後に動いた時刻の新しい順） */
export const LIST_PROJECT_CHATS_MAX = 200;

/** 記録の行に出す文（「チャット 12（38 回目より前）」） */
export function describeReadChat(input: Record<string, unknown>): string {
  const target = typeof input.chat_id === "number" ? `チャット ${input.chat_id}` : "";
  if (typeof input.event_id === "number") return `${target}（発言 ${input.event_id}）`;
  return typeof input.before === "number" ? `${target}（${input.before} 回目より前）` : target;
}
