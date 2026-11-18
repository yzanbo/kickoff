import { useEffect, useRef } from "react";
import { OVERAGE_STATE_HINTS, overageStateOf, type OverageState } from "@shared/overage";
import type { PlanUsage } from "@shared/types";
import { showToast } from "@/ui/toast";

/** 帯の札の横に出す短い文（オフ・不明は出さない。課金されないか分からないだけなので、詳細で伝える） */
const BADGE_TEXT: Partial<Record<OverageState, string>> = { in_use: "超過分で課金中", on: "追加枠オン" };

/**
 * 下の帯の Claude の札の横の、超過分（追加の使用枠）の印。いま超過分で動いていれば赤く「超過分で課金中」、
 * 追加の使用枠がオンなら「追加枠オン」（上限を超えると課金される）。意図せず課金していないかを一目で分かるように
 */
export function OverageBadge({ usage }: { usage: PlanUsage | undefined }) {
  const state = overageStateOf(usage);
  const text = BADGE_TEXT[state];
  if (!text) return null;
  return (
    <span className="footer-usage-overage" data-state={state} title={OVERAGE_STATE_HINTS[state]}>
      {text}
    </span>
  );
}

/** 超過分で動き始めたら（前は動いていなかった）、画面の下に知らせる。開いたときにもう動いていたら知らせない（帯の印で分かる） */
export function useOverageToast(usage: PlanUsage | undefined) {
  const inUse = usage?.overage?.in_use ?? null;
  const previous = useRef(inUse);
  useEffect(() => {
    if (inUse && previous.current === false) showToast(`Claude: ${OVERAGE_STATE_HINTS.in_use}`);
    if (inUse !== null) previous.current = inUse;
  }, [inUse]);
}
