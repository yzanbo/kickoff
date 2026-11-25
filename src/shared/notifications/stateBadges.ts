import type { Same } from "@shared/foundation/contract";
import type { StateBadges } from "@shared/foundation/ipc";

/** 集計の列を表示位置と IPC のキーに対応させる。右下はアプリやデスクトップの印のために空ける。 */
export const STATE_BADGE_LAYOUT = {
  running: { corner: "topLeft", ipcKey: "running" },
  needs_input: { corner: "bottomLeft", ipcKey: "needsInput" },
  unread: { corner: "topRight", ipcKey: "unread" },
} as const;

export type StateBadgeColumn = keyof typeof STATE_BADGE_LAYOUT;
type StateBadgeKey = (typeof STATE_BADGE_LAYOUT)[StateBadgeColumn]["ipcKey"];
true satisfies Same<StateBadgeKey, keyof StateBadges["counts"]>;
true satisfies Same<StateBadgeKey, keyof StateBadges["colors"]>;

export const STATE_BADGE_COLUMNS = Object.keys(STATE_BADGE_LAYOUT) as readonly StateBadgeColumn[];

/** 集計の列順を保ちつつ、IPC のキーで値をまとめる。 */
export function mapStateBadges<T>(value: (column: StateBadgeColumn) => T): Record<StateBadgeKey, T> {
  const entries = STATE_BADGE_COLUMNS.map((column) => [STATE_BADGE_LAYOUT[column].ipcKey, value(column)] as const);
  return Object.fromEntries(entries) as Record<StateBadgeKey, T>;
}
