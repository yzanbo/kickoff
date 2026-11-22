// chatPanel の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

declare module "@/foundation/ui/shell/points" {
  interface AppDialogMap {
    /** 新しいチャットを始める（⌘N と同じ。App が、開いている・サイドバーで選んでいるプロジェクトで始める） */
    newChat: null;
  }
}

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const chatPanelSettings = { projectBrowserSession: storage.settings.projectBrowserSession } as const;
export { restoreDraftTabs, useDraftTabSpots, type PlacedDraft } from "./drafts/panelDrafts";
export { useVisibleChildChats } from "./visibleChildChats";
export { panelFollow } from "./panelFollow";
export { chatSideAdds, type ChatSideAdd, type ChatSideAddProps } from "./chatSideAdds";
