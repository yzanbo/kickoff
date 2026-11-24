import "./CheckStateIcon.css";
import { Check, CircleDashed, CircleMinus, X, type LucideIcon } from "lucide-react";
import { CI_STATE_LABELS, type CiState } from "@shared/github/ciTypes";
import { cx } from "@/foundation/ui/lib/cx";

/** 状態ごとの印と色（色は .github-checks と data-ci） */
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

/**
 * CI・チェックの状態の印（PR の一覧のまとめ・PR のチェック・CI のタブの実行・ジョブ・ステップ・外の CI）。乗せると label（既定は状態の名前）。
 * ci は CI のタブの印（.ci-state。途中は回す）
 */
export function CheckStateIcon({ state, size = 14, label = CI_STATE_LABELS[state], ci = false }: { state: CiState; size?: number; label?: string; ci?: boolean }) {
  const { icon: Icon, tone } = LOOKS[state];
  return <Icon size={size} className={cx(ci && "ci-state", "github-checks", ci && state === "pending" && "ci-state-pending")} data-ci={tone} aria-label={label} data-tip={label} />;
}
