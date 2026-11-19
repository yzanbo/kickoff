import { extraUsageSpendText, OVERAGE_STATE_HINTS, OVERAGE_STATE_LABELS, overageStateOf } from "@shared/ai/overage";
import type { PlanUsage } from "@shared/types";

/** プランの使用枠の詳細の中の、超過分（追加の使用枠）の様子と、この請求期間の超過分の額 */
export function OverageDetails({ usage }: { usage: PlanUsage }) {
  const state = overageStateOf(usage);
  const spend = usage.extra_usage ? extraUsageSpendText(usage.extra_usage) : null;
  return (
    <div className="usage-overage" data-state={state}>
      <div className="usage-overage-label">{OVERAGE_STATE_LABELS[state]}</div>
      <div className="muted small">{OVERAGE_STATE_HINTS[state]}</div>
      {spend && <div className="small">{spend}</div>}
    </div>
  );
}
