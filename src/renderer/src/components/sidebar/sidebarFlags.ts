import { agentStateOf, boardColumnOf } from "../../../../core/board";
import type { AgentState, Approval, BoardColumn, Run } from "../../../../core/types";

/** チャットの並べ方（ChatGroupingMenu の CHAT_GROUPINGS。どのプロジェクトでも同じ） */
export const GROUPING_KEY = "kickoff:sidebar-grouping";
/** 自分待ち（回答待ち・確認待ち）のチャットだけを出すか（"1" なら出す。上の行の「自分待ち」で切り替える） */
export const WAITING_ONLY_KEY = "kickoff:sidebar-waiting-only";
/** チャットを 1 行で出すか（"1" なら 2 行目のセクション・ブランチを隠す。並べ方のメニューで切り替える） */
export const COMPACT_KEY = "kickoff:sidebar-compact";
/** アーカイブ済みのチャットを一覧の下に出すか（どのプロジェクトでも同じ。はじめは出さない） */
export const SHOW_ARCHIVED_KEY = "kickoff:sidebar-show-archived";

/** 自分が見る番か（カンバンの回答待ち・確認待ちの列と同じ） */
export const isWaitingState = (state: AgentState) => {
  const column = boardColumnOf(state);
  return column === "needs_input" || column === "review";
};

/** 自分待ちのチャット（アーカイブしたものは除く） */
export const waitingRuns = (runs: Run[], approvals: Approval[]) =>
  runs.filter((r) => !r.archived_at && isWaitingState(agentStateOf(r, approvals.some((a) => a.run_id === r.id))));

/** サイドバーのプロジェクトに出す状態ごとのチャット数（作業中・回答待ち・確認待ち。アーカイブしたものは数えない） */
export type StateCounts = Record<Exclude<BoardColumn, "done">, number>;

export function stateCounts(runs: Run[], approvals: Approval[]): StateCounts {
  const counts: StateCounts = { running: 0, needs_input: 0, review: 0 };
  for (const r of runs) {
    if (r.archived_at) continue;
    const column = boardColumnOf(agentStateOf(r, approvals.some((a) => a.run_id === r.id)));
    if (column !== "done") counts[column]++;
  }
  return counts;
}
