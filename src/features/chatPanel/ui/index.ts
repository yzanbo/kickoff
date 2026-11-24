// chatPanel の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

declare module "@/foundation/ui/shell/points" {
  interface AppDialogMap {
    /** 新しいチャットを始める（⌘N と同じ。./appHosts.ts が、開いている・サイドバーで選んでいるプロジェクトで始める） */
    newChat: null;
  }
}

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const chatPanelSettings = { projectBrowserSession: storage.settings.projectBrowserSession } as const;
export { restoreDraftTabs, useDraftTabSpots, type PlacedDraft } from "./drafts/panelDrafts";
export { useVisibleChildChats } from "./visibleChildChats";
export { panelFollow } from "./panelFollow";
export { holdChatsElsewhere } from "./state/windowChats";
export { chatSideAdds, type ChatSideAdd, type ChatSideAddProps } from "./chatSideAdds";
export { useDraftSide } from "./agents/draftSide";
export { openSeededChat } from "./openSeededChat";
export { PanelToggle } from "./board/PanelToggle";
export { panelChats, useChatsTabLinks } from "./board/boardChats";
export { useBoardPanel } from "./board/useBoardPanel";
export { DraftMenuItems, DraftSplitItems, DraftTitleInput } from "./drafts/DraftMenuItems";
export { draftTitleOf, hasDraftAttachments, openDraft, setDraftGroup, useAllDrafts } from "./drafts/panelDrafts";
