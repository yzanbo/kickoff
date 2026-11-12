// チャットの AI が自分の子チャットを作るツール（kickoff_chat の create_child_chat）の、コアと画面で共有する名前と決まり

/** ツールの名前（MCP のサーバー kickoff_chat の create_child_chat。ツールの行・承認カードで出し分ける） */
export const AI_CHILD_CHAT_TOOL = "mcp__kickoff_chat__create_child_chat";

/** AI が作れる子チャットの深さ（根のチャットから何段目までか。2 = 孫チャットまで。孫チャットの AI にはツールを渡さない） */
export const AI_CHILD_CHAT_MAX_DEPTH = 2;

/** ツールの結果に書く、作った子チャットの印（画面が結果から子チャットを開くために読む） */
export const childChatMark = (chatId: number) => `（Kickoff のチャット ID: ${chatId}）`;

/** ツールの結果から、作った子チャットの ID を読む（作れなかった・印がなければ null） */
export function childChatIdOf(result: string): number | null {
  const m = /（Kickoff のチャット ID: (\d+)）/.exec(result);
  return m ? Number(m[1]) : null;
}
