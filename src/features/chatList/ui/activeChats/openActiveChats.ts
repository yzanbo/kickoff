import { openAppDialog } from "@/foundation/ui/shell/points";

/** 開くときの指定 */
export interface ActiveChatsRequest {
  /** 初めから絞り込んでおくプロジェクト（省けば「すべて」。開いたあとも Tab で切り替えられる） */
  projectId?: number;
}

declare module "@/foundation/ui/shell/points" {
  interface AppDialogMap {
    /** ⌘⇧A の一覧（作業中・回答待ち・未読・下書き） */
    activeChats: ActiveChatsRequest;
  }
}

/** ⌘⇧A の一覧を開く（App が受け取る。サイドバーのプロジェクトのカード・プロジェクト画面の見出しのボタン・プロジェクトの右クリック） */
export function openActiveChats(request: ActiveChatsRequest = {}) {
  openAppDialog("activeChats", request);
}
