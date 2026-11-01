import type { PlanUsage } from "../../../core/types";
import { cx } from "../cx";
import { formatClock } from "../time";

/** 使用枠の「何時時点」と、最新の取得に失敗したときの理由 */
export function UsageFetchedNote({ usage, className }: { usage: PlanUsage; className?: string }) {
  return (
    <p className={cx("muted small", className)}>
      {formatClock(usage.fetched_at)} 時点（5 分ごとに自動更新）
      {usage.error && <span className="error"> ・最新の取得に失敗: {usage.error}</span>}
    </p>
  );
}
