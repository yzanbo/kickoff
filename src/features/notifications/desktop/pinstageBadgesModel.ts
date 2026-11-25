import { COLUMN_LOOKS } from "@shared/chat/stateLooks";
import type { StateBadges } from "@shared/foundation/ipc";
import { STATE_BADGE_COLUMNS, STATE_BADGE_LAYOUT, type StateBadgeColumn } from "@shared/notifications/stateBadges";

export const KICKOFF_BUNDLE_ID = "dev.zanbo.kickoff";
const MAX_BYTES = 8_192;
const MAX_COUNT = 1_000_000;
export interface PinstageBadge {
  corner: (typeof STATE_BADGE_LAYOUT)[StateBadgeColumn]["corner"];
  count: number;
  label: string;
  color?: string;
}

export function pinstageBadgeItems({ counts, colors }: StateBadges): PinstageBadge[] {
  return STATE_BADGE_COLUMNS.flatMap((column) => {
    const { ipcKey, corner } = STATE_BADGE_LAYOUT[column];
    const count = Math.min(counts[ipcKey], MAX_COUNT);
    if (count === 0) return [];
    const color = colors[ipcKey];
    return [{
      corner,
      count,
      label: COLUMN_LOOKS[column].label,
      ...(color?.length === 7 && /^#[0-9a-f]{6}$/i.test(color) ? { color: color.toUpperCase() } : {}),
    }];
  });
}

export function encodePinstageBadges(badges: readonly PinstageBadge[], pid: number, nowMs: number): string {
  const json = JSON.stringify({ version: 1, bundleID: KICKOFF_BUNDLE_ID, pid, updatedAt: nowMs / 1000, badges });
  if (Buffer.byteLength(json, "utf8") > MAX_BYTES) throw new Error("バッジのファイルが 8,192 バイトを超えました");
  return json;
}
