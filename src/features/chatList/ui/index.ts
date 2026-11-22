// chatList の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export { askNewGroup, MoveToGroupItem, MoveToProjectItem } from "./menu/MoveItems";
export { ChatMenuItems } from "./menu/ChatMenuItems";
export { BucketColorItem } from "./BucketColorItem";
export type { DraftTabSpot } from "./manualOrder";
export { ChatSelectionContext, useChatSelection, useChatSelectionState, visibleRows, type ChatSelection } from "./selection/chatSelection";
export { SelectionBar } from "./selection/SelectionBar";
export { ActiveChatsPalette } from "./activeChats/ActiveChatsPalette";
export { chatListOptions, useChatOrder, useManualChatReorder } from "./chatOrder";
export { StateCornerCounts, stateCountsSummary } from "./StateCornerCounts";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const chatListSettings = {
  projectCompact: storage.settings.projectCompact,
  sections: storage.settings.sections,
  order: storage.settings.order,
  compact: storage.settings.compact,
  showArchived: storage.settings.showArchived,
  bucketColors: storage.settings.bucketColors,
  archiveFilter: storage.settings.archiveFilter,
} as const;
