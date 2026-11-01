import type { AgentState, BoardStage } from "../../../../core/types";

/** カンバンの列の色（状態の点の色を流用。完了は控えめ） */
export const STAGE_TONE: Record<BoardStage, string> = {
  todo: "var(--extra-muted)",
  doing: "var(--dot-running)",
  review: "var(--dot-needs-input)",
  done: "var(--dot-attention)",
};

/** カードの点の色（エージェントの状態） */
export const STATE_TONE: Record<AgentState, string> = {
  needs_input: "var(--dot-needs-input)",
  failed: "var(--dot-failed)",
  running: "var(--dot-running)",
  attention: "var(--dot-attention)",
  done: "var(--extra-muted)",
};
