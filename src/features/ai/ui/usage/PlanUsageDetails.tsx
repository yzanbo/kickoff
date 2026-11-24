import { planWindows, type ProviderUsage } from "@shared/ai/usage";
import { SpendState } from "./SpendState";
import { FIVE_HOUR_IDLE, usageUnavailableText } from "./usage";
import { UsageFetchedNote } from "./UsageFetchedNote";
import { UsageMeter } from "./UsageMeter";

/** Claude Code のプランの使用枠の詳細（5 時間・週・モデル別の週・超過分（追加の使用枠）の様子と、取得した時刻。下の帯の使用状況の詳細の中に置く） */
export function PlanUsageDetails({ usage }: { usage: ProviderUsage | undefined }) {
  if (!usage) return <p className="muted small usage-popover-foot">取得中…</p>;
  if (usage.status !== "ok") return <p className="muted small usage-popover-foot">{usageUnavailableText(usage)}</p>;
  const { fiveHour, sevenDay, modelWeekly } = planWindows(usage);
  return (
    <div className="usage-popover-body">
      <UsageMeter window={fiveHour} idleText={FIVE_HOUR_IDLE} />
      <UsageMeter window={sevenDay} />
      {modelWeekly.map((w) => (
        <UsageMeter key={w.key} window={w} />
      ))}
      <SpendState kind="overage" pay={usage.pay_as_you_go} />
      <UsageFetchedNote usage={usage} className="usage-popover-foot" />
    </div>
  );
}
