/** ⌘⇧A の一覧（作業中・回答待ち・未読・下書き）を開く（App が受け取る。サイドバーのプロジェクトのカード・プロジェクト画面の見出しのボタン・プロジェクトの右クリック） */
export const OPEN_ACTIVE_CHATS_EVENT = "kickoff:open-active-chats";

/** 開くときの指定 */
export interface ActiveChatsRequest {
  /** 初めから絞り込んでおくプロジェクト（省けば「すべて」。開いたあとも Tab で切り替えられる） */
  projectId?: number;
}

export function openActiveChats(request: ActiveChatsRequest = {}) {
  window.dispatchEvent(new CustomEvent<ActiveChatsRequest>(OPEN_ACTIVE_CHATS_EVENT, { detail: request }));
}
