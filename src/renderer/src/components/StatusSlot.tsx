import { CircleAlert } from "lucide-react";
import type { AgentState } from "../../../core/types";
import { AGENT_STATE_LABELS } from "../../../core/types";

/**
 * 行の先頭に置く状態の印（見せ方）。
 * 作業中: 回るリング / 回答待ち: 琥珀色の！ / 確認待ち: 緑の点 / エラー: 赤の点 / 待機中: 薄い点
 */
export function StatusSlot({ state }: { state: AgentState }) {
  const label = AGENT_STATE_LABELS[state];
  return (
    <span className={`status-slot state-${state}`} title={label} aria-label={label} role="img">
      {state === "running" ? (
        <span className="status-ring" />
      ) : state === "needs_input" ? (
        <CircleAlert size={13} fill="currentColor" stroke="var(--bg-sidebar)" />
      ) : (
        <span className="status-dot-mark" />
      )}
    </span>
  );
}
