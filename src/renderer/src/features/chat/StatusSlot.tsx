import { CircleAlert } from "lucide-react";
import type { AgentState } from "@shared/types";
import { AGENT_STATE_LABELS } from "@shared/types";

/**
 * 行の先頭に置く状態の印（見せ方）。
 * 作業中: 回るリング / 回答待ち: 琥珀色の！ / 未読: 緑の点 / エラー: 赤の点 / 既読: 薄い点。
 * unread: 作業中のまま、まだ見ていない返答がある（リングの右上に小さな緑の点を重ねる。board.ts の busyWithUnread）
 */
export function StatusSlot({ state, unread = false }: { state: AgentState; unread?: boolean }) {
  const label = unread ? `${AGENT_STATE_LABELS[state]}・未読あり` : AGENT_STATE_LABELS[state];
  return (
    <span className={`status-slot state-${state}`} title={label} aria-label={label} role="img">
      {state === "running" ? (
        <span className="status-ring" />
      ) : state === "needs_input" ? (
        <CircleAlert size={13} fill="currentColor" stroke="var(--bg-sidebar)" />
      ) : (
        <span className="status-dot-mark" />
      )}
      {unread && <span className="status-unread-badge" />}
    </span>
  );
}
