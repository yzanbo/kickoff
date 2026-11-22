import { CircleAlert } from "lucide-react";
import { STATE_LOOKS } from "@shared/chat/stateLooks";
import type { AgentState } from "@shared/chat/types";

/**
 * 行の先頭に置く状態の印。
 * 作業中: 回るリング / 回答待ち: 琥珀色の！ / 未読: 緑の点 / エラー: 赤の点 / 既読: 薄い点。
 * unread: 作業中のまま、まだ見ていない返答がある（リングの右上に小さな緑の点を重ねる。state.ts の busyWithUnread）。
 * label: 乗せたときの文（なければ状態の名前。サブエージェントの「報告が届いていません」など、細かい様子を出すとき）
 */
export function StatusSlot({ state, unread = false, label: name = STATE_LOOKS[state].label }: { state: AgentState; unread?: boolean; label?: string }) {
  const label = unread ? `${name}・未読あり` : name;
  return (
    <span className="status-slot" data-state={STATE_LOOKS[state].tone} title={label} aria-label={label} role="img">
      {state === "running" ? (
        <span className="status-ring" />
      ) : state === "needs_input" ? (
        <CircleAlert size={13} fill="currentColor" />
      ) : (
        <span className="status-dot-mark" />
      )}
      {unread && <span className="status-unread-badge" />}
    </span>
  );
}
