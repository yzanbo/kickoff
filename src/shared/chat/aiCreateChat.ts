// チャットの AI がチャット（子・兄弟・親のないチャット）を作るツール（kickoff_chat の create_chat）の、コアと画面で共有する名前と決まり

/** ツールの名前（MCP のサーバー kickoff_chat の create_chat。ツールの行・承認カードで出し分ける） */
export const AI_CREATE_CHAT_TOOL = "mcp__kickoff_chat__create_chat";

/** 前の版のツールの名前（子チャットだけを作った create_child_chat。記録に残った行を同じに出すため） */
export const AI_CHILD_CHAT_TOOL_LEGACY = "mcp__kickoff_chat__create_child_chat";

/** チャットを作るツールか（いまの create_chat と、前の版の create_child_chat） */
export const isCreateChatTool = (name: string) => name === AI_CREATE_CHAT_TOOL || name === AI_CHILD_CHAT_TOOL_LEGACY;

/** 作る場所: 自分の子 / 自分の親の子（兄弟） / 親のないチャット */
export const AI_CHAT_RELATIONS = ["child", "sibling", "root"] as const;
export type AiChatRelation = (typeof AI_CHAT_RELATIONS)[number];

export const AI_CHAT_RELATION_LABELS: Record<AiChatRelation, string> = {
  child: "子チャット",
  sibling: "兄弟チャット",
  root: "親のないチャット",
};

/** ツールの入力の relation を読む（前の版の create_child_chat・知らない値は子チャット） */
export function relationOf(input: Record<string, unknown>): AiChatRelation {
  const value = input.relation;
  return typeof value === "string" && (AI_CHAT_RELATIONS as readonly string[]).includes(value) ? (value as AiChatRelation) : "child";
}

/** AI が作れる子チャットの深さ（根のチャットから何段目までか。2 = 孫チャットまで。孫チャットからは子チャットを作れない） */
export const AI_CHILD_CHAT_MAX_DEPTH = 2;

/** AI が作ったチャットの世代の上限（利用者が作ったチャット = 0。2 世代目のチャットからは作れない。Q7） */
export const AI_CHAT_MAX_GENERATION = 2;

/** 1 回の作業（Turn）で AI が作れるチャットの数（Q7） */
export const AI_CHATS_PER_TURN = 5;

/** ツールの結果に書く、作ったチャットの印（画面が結果からチャットを開くために読む。前の版の子チャットの結果も同じ形） */
export const createdChatMark = (chatId: number) => `（Kickoff のチャット ID: ${chatId}）`;

/** ツールの結果から、作ったチャットの ID を読む（作れなかった・印がなければ null） */
export function createdChatIdOf(result: string): number | null {
  const m = /（Kickoff のチャット ID: (\d+)）/.exec(result);
  return m ? Number(m[1]) : null;
}
