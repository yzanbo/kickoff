import { CODEX_CREDIT_STATE_HINTS, CODEX_CREDIT_STATE_LABELS, codexCreditSpendText, codexCreditStateOf } from "@shared/ai/overage";
import type { CodexCredits } from "@shared/ai/types";
import { formatClock } from "@/foundation/ui/lib/time";

/** Codex の使用状況の詳細の中の、クレジットの様子と、減った分（いつから） */
export function CodexCreditsDetails({ credits }: { credits: CodexCredits }) {
  const state = codexCreditStateOf(credits);
  const spend = codexCreditSpendText(credits);
  return (
    <div className="usage-overage" data-state={state}>
      <div className="usage-overage-label">{CODEX_CREDIT_STATE_LABELS[state]}</div>
      <div className="muted small">{CODEX_CREDIT_STATE_HINTS[state]}</div>
      {spend && credits.spending && (
        <div className="small">
          {spend}・{formatClock(credits.spending.since)} から
        </div>
      )}
    </div>
  );
}
