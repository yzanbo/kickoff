import { useEffect, useRef } from "react";
import { CODEX_CREDIT_STATE_HINTS, codexCreditStateOf, OVERAGE_STATE_HINTS, overageStateOf, type OverageState } from "@shared/overage";
import type { CodexCredits, PlanUsage } from "@shared/types";
import { showToast } from "@/ui/toast";

/** 帯の札の横に出す短い文（オフ・不明は出さない。課金されないか分からないだけなので、詳細で伝える） */
const CLAUDE_BADGE: Partial<Record<OverageState, string>> = { in_use: "超過分で課金中", on: "追加枠オン" };
const CODEX_BADGE: Partial<Record<OverageState, string>> = { in_use: "クレジット使用中", on: "クレジットあり" };

/**
 * 下の帯の AI の札の横の、プランの上限を超えたあとの支払いの印。いま払って動いていれば赤く（Claude「超過分で課金中」・Codex「クレジット使用中」）、
 * 上限を超えると払うことになるなら枠線だけ（「追加枠オン」・「クレジットあり」）。意図せず課金していないかを一目で分かるように
 */
function Badge({ state, text, hint }: { state: OverageState; text: string | undefined; hint: string }) {
  if (!text) return null;
  return (
    <span className="footer-usage-overage" data-state={state} title={hint}>
      {text}
    </span>
  );
}

/** Claude の超過分（追加の使用枠）の印 */
export function OverageBadge({ usage }: { usage: PlanUsage | undefined }) {
  const state = overageStateOf(usage);
  return <Badge state={state} text={CLAUDE_BADGE[state]} hint={OVERAGE_STATE_HINTS[state]} />;
}

/** Codex のクレジットの印 */
export function CodexCreditsBadge({ credits }: { credits: CodexCredits | null | undefined }) {
  const state = codexCreditStateOf(credits);
  return <Badge state={state} text={CODEX_BADGE[state]} hint={CODEX_CREDIT_STATE_HINTS[state]} />;
}

/**
 * 払って動き始めたら（前は払っていなかった）、画面の下に知らせる。開いたときにもう払っていたら知らせない（帯の印で分かる）。
 * Claude は超過分で動いているか、Codex はクレジットの残りが減ったか
 */
export function useOverageToast(usage: PlanUsage | undefined, codexCredits: CodexCredits | null | undefined) {
  useStartToast(usage?.overage?.in_use ?? null, `Claude: ${OVERAGE_STATE_HINTS.in_use}`);
  useStartToast(codexCredits ? codexCredits.spending !== null : null, `Codex: ${CODEX_CREDIT_STATE_HINTS.in_use}`);
}

/** active が false から true に変わったら知らせる（null = まだ分からないは、前の値として覚えない） */
function useStartToast(active: boolean | null, message: string) {
  const previous = useRef(active);
  useEffect(() => {
    if (active && previous.current === false) showToast(message);
    if (active !== null) previous.current = active;
  }, [active, message]);
}
