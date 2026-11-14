// チャットの AI がチャットをアーカイブする・消す（Kickoff のゴミ箱へ）ツール（kickoff_chat の archive_chat・delete_chat）の、
// コアと画面で共有する名前と、記録の行に出す文

/** チャットをアーカイブするツールの名前 */
export const AI_ARCHIVE_CHAT_TOOL = "mcp__kickoff_chat__archive_chat";

/** チャットを消す（Kickoff のゴミ箱へ入れる）ツールの名前 */
export const AI_DELETE_CHAT_TOOL = "mcp__kickoff_chat__delete_chat";

/** アーカイブ・削除のツールの引数（同じプロジェクトのチャットの ID） */
export interface RemoveChatInput {
  chat_id: number;
}

/** 記録の行に出す文（どのチャットか） */
export function describeRemoveChat(input: Record<string, unknown>): string {
  return typeof input.chat_id === "number" ? `チャット ${input.chat_id}` : "";
}
