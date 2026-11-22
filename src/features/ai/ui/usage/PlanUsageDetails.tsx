import type { PlanUsage } from "@shared/ai/types";
import { SpendState } from "./SpendState";
import { FIVE_HOUR_IDLE, usageUnavailableText } from "./usage";
import { UsageFetchedNote } from "./UsageFetchedNote";
import { UsageMeter } from "./UsageMeter";

/** Claude Code のプランの使用枠の詳細（5 時間・週・モデル別の週・超過分（追加の使用枠）の様子と、取得した時刻。下の帯の使用状況の詳細の中に置く） */
export function PlanUsageDetails({ usage }: { usage: PlanUsage | undefined }) {
  if (!usage) return <p className="muted small usage-popover-foot">取得中…</p>;
  if (!usage.available) return <p className="muted small usage-popover-foot">{usageUnavailableText(usage)}</p>;
  return (
    <div className="usage-popover-body">
      <UsageMeter window={usage.five_hour} idleText={FIVE_HOUR_IDLE} />
      <UsageMeter window={usage.seven_day} />
      {usage.model_weekly.map((w) => (
        <UsageMeter key={w.key} window={w} />
      ))}
      <SpendState usage={usage} />
      <UsageFetchedNote usage={usage} className="usage-popover-foot" />
    </div>
  );
}
