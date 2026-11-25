import { COLUMN_LOOKS } from "@shared/chat/stateLooks";
import type { Same } from "@shared/foundation/contract";
import type { StateBadges } from "@shared/foundation/ipc";
import { parseColor } from "@shared/foundation/theme/color";
import { mapStateBadges, type StateBadgeColumn } from "@shared/notifications/stateBadges";
import type { CountedColumn, StateCounts } from "@/features/chat/ui";

true satisfies Same<StateBadgeColumn, CountedColumn>;

/** 丸の色は画面の状態の点と同じ。Dock と書き出しは同じ変数を読む。 */
export const badgeColorVariable = (column: StateBadgeColumn) => `--dot-${COLUMN_LOOKS[column].tone}`;

export function makeStateBadges(counts: StateCounts, readColor: (name: string) => string): StateBadges {
  const colors = mapStateBadges((column) => {
    if (counts[column] === 0) return null;
    try {
      const value = parseColor(readColor(badgeColorVariable(column)));
      if (!value || value.alpha !== 1 || !value.rgb.every(Number.isFinite)) return null;
      return "#" + value.rgb.map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")).join("");
    } catch {
      // 色が取れないときも、件数だけは公開できる。
      return null;
    }
  });
  return { counts: mapStateBadges((column) => counts[column]), colors };
}
