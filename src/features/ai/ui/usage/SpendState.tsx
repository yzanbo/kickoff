import {
  CODEX_CREDIT_STATE_HINTS,
  CODEX_CREDIT_STATE_LABELS,
  codexCreditSpendText,
  codexCreditStateOf,
  extraUsageSpendText,
  OVERAGE_STATE_HINTS,
  OVERAGE_STATE_LABELS,
  overageStateOf,
} from "@shared/ai/overage";
import type { CodexCredits, PlanUsage } from "@shared/ai/types";
import { formatClock } from "@/foundation/ui/lib/time";

/**
 * 使用状況の詳細の中の、プランの上限を超えたあとの支払いの様子（Claude は超過分（追加の使用枠）とこの請求期間の額、
 * Codex はクレジットと減った分（いつから））
 */
export function SpendState(props: { usage: PlanUsage } | { credits: CodexCredits }) {
  const { state, label, hint, spend } =
    "usage" in props ? claudeSpend(props.usage) : codexSpend(props.credits);
  return (
    <div className="usage-overage" data-state={state}>
      <div className="usage-overage-label">{label}</div>
      <div className="muted small">{hint}</div>
      {spend && <div className="small">{spend}</div>}
    </div>
  );
}

function claudeSpend(usage: PlanUsage) {
  const state = overageStateOf(usage);
  return { state, label: OVERAGE_STATE_LABELS[state], hint: OVERAGE_STATE_HINTS[state], spend: usage.extra_usage ? extraUsageSpendText(usage.extra_usage) : null };
}

function codexSpend(credits: CodexCredits) {
  const state = codexCreditStateOf(credits);
  const spend = codexCreditSpendText(credits);
  return {
    state,
    label: CODEX_CREDIT_STATE_LABELS[state],
    hint: CODEX_CREDIT_STATE_HINTS[state],
    spend: spend && credits.spending ? `${spend}・${formatClock(credits.spending.since)} から` : null,
  };
}
