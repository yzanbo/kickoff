// groups の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const groupsSettings = { ungroupedAt: storage.settings.ungroupedAt } as const;

export { GroupPickFlyout } from "./GroupPickFlyout";
export { askNewGroupName } from "./groups";
