import type { AgentState, BoardColumn } from "../../../../core/types";

/** カンバンの列の色（状態の点の色と同じ。完了は控えめ） */
export const COLUMN_TONE: Record<BoardColumn, string> = {
  running: "var(--dot-running)",
  needs_input: "var(--dot-needs-input)",
  review: "var(--dot-attention)",
  done: "var(--extra-muted)",
};

/** 「下書き」の列の色（まだ送っていない。AI は何もしていない） */
export const DRAFT_TONE = "var(--extra-muted)";

/** カードの点の色（エージェントの状態） */
export const STATE_TONE: Record<AgentState, string> = {
  needs_input: "var(--dot-needs-input)",
  failed: "var(--dot-failed)",
  running: "var(--dot-running)",
  attention: "var(--dot-attention)",
  done: "var(--extra-muted)",
};
