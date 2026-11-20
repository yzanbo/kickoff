import { Check, CircleDashed, CircleMinus, X, type LucideIcon } from "lucide-react";
import { CI_STATE_LABELS, type CiState } from "@shared/github/ciTypes";

/** 状態ごとの印と色（色は GitHub の PR のチェックと同じ .github-checks と data-ci） */
const LOOKS: Record<CiState, { icon: LucideIcon; tone: "success" | "failure" | "pending" | "neutral" }> = {
  pending: { icon: CircleDashed, tone: "pending" },
  success: { icon: Check, tone: "success" },
  failure: { icon: X, tone: "failure" },
  cancelled: { icon: CircleMinus, tone: "neutral" },
  skipped: { icon: CircleMinus, tone: "neutral" },
  neutral: { icon: CircleMinus, tone: "neutral" },
};

/** 状態の色の種類（data-ci の値） */
export const ciTone = (state: CiState) => LOOKS[state].tone;

/** 実行・ジョブ・ステップ・外の CI の状態の印（乗せると名前） */
export function CiStateIcon({ state, size = 14 }: { state: CiState; size?: number }) {
  const { icon: Icon, tone } = LOOKS[state];
  return <Icon size={size} className={`ci-state github-checks${state === "pending" ? " ci-state-pending" : ""}`} data-ci={tone} aria-label={CI_STATE_LABELS[state]} data-tip={CI_STATE_LABELS[state]} />;
}
