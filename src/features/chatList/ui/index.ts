// chatList の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export { askNewGroup, MoveToGroupItem, MoveToProjectItem } from "./menu/MoveItems";
export { ChatMenuItems } from "./menu/ChatMenuItems";
export { ChatMenu } from "./menu/ChatMenu";
export { BucketColorItem } from "./BucketColorItem";
export type { DraftTabSpot } from "./manualOrder";
export { ChatSelectionContext, useChatSelection, useChatSelectionState, visibleRows, type ChatSelection } from "./selection/chatSelection";
export { SelectionBar } from "./selection/SelectionBar";
export { ActiveChatsPalette } from "./activeChats/ActiveChatsPalette";
export type { ActiveChatsRequest } from "./activeChats/openActiveChats";
export { chatListOptions, useChatOrder, useManualChatReorder } from "./chatOrder";
export { StateCornerCounts, stateCountsSummary } from "./StateCornerCounts";
export { StateStats } from "./StateStats";
export { StateChip } from "./StateChip";
export { BucketTree, type HeadSpec, type HeadTable } from "./BucketTree";
export { ChatRowFace, ChatRowTime } from "./ChatRowFace";
export { activeOf, ArchivableItems, archivedOf, ColumnBody } from "./ArchivableItems";
export { chatItemProps } from "./chatItemProps";
export { newChatPlaceOf, type BucketBy, type BucketHead, type ChatBucket } from "./buckets";
export { pinnedKey, projectKey } from "./bucketHeads";
export { useChatBuckets } from "./useChatBuckets";
export { CHAT_ORDERS, GROUPING_META, ORDER_META, useChatLayout } from "./chatLayout";
export { CHAT_GROUPINGS } from "./chatGrouping";
export { confirmRemoveView, NamedViewTabs } from "./NamedViewTabs";
export { draggingChat, GROUP_DRAG_TYPE, PROJECT_DRAG_TYPE, startChatDrag, startDraftDrag, useChatDragging, useChatDropTarget, useChatDropTargets, type DraftRef } from "./drag";
export { restoreDroppedChat, useGroupDrop } from "./groupDrop";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const chatListSettings = {
  projectCompact: storage.settings.projectCompact,
  sections: storage.settings.sections,
  order: storage.settings.order,
  compact: storage.settings.compact,
  showArchived: storage.settings.showArchived,
  bucketColors: storage.settings.bucketColors,
} as const;
