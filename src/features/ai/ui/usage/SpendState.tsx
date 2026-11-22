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
import type { PayAsYouGo } from "@shared/ai/usage";
import { formatClock } from "@/foundation/ui/lib/time";

/**
 * 使用状況の詳細の中の、プランの上限を超えたあとの支払いの様子（overage = Claude の超過分（追加の使用枠）とこの請求期間の額、
 * credits = Codex のクレジットと減った分（いつから））
 */
export function SpendState({ kind, pay }: { kind: "overage"; pay: PayAsYouGo | null } | { kind: "credits"; pay: PayAsYouGo }) {
  const { state, label, hint, spend } = kind === "overage" ? overageSpend(pay) : creditsSpend(pay);
  return (
    <div className="usage-overage" data-state={state}>
      <div className="usage-overage-label">{label}</div>
      <div className="muted small">{hint}</div>
      {spend && <div className="small">{spend}</div>}
    </div>
  );
}

function overageSpend(pay: PayAsYouGo | null) {
  const state = overageStateOf(pay);
  return { state, label: OVERAGE_STATE_LABELS[state], hint: OVERAGE_STATE_HINTS[state], spend: extraUsageSpendText(pay) };
}

function creditsSpend(pay: PayAsYouGo) {
  const state = codexCreditStateOf(pay);
  const spend = codexCreditSpendText(pay);
  return {
    state,
    label: CODEX_CREDIT_STATE_LABELS[state],
    hint: CODEX_CREDIT_STATE_HINTS[state],
    spend: spend && pay.spending ? `${spend}・${formatClock(pay.spending.since)} から` : null,
  };
}
