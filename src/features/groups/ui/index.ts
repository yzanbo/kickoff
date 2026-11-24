// groups の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const groupsSettings = { ungroupedAt: storage.settings.ungroupedAt } as const;

export { GroupPickFlyout } from "./GroupPickFlyout";
export { askNewGroupName, confirmDeleteGroup } from "./groupDialogs";
export { NO_GROUPS, useGroupsOf } from "./stores/groups";
export { orderGroupBuckets, splitAtUngrouped, UNGROUPED_SORT_ID, ungroupedPosition } from "./groupOrder";
export { groupsApi } from "./api/groups";
export { GroupChip } from "./GroupChip";
export { useGroupMenu } from "./GroupMenu";
export { GroupPickMenu } from "./GroupPickMenu";
export { GroupPicker } from "./GroupPicker";
export { groupNameIn, useGroup, useGroups } from "./stores/groups";
