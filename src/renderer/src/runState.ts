import { agentStateOf, boardColumnOf } from "../../core/board";
import type { AgentState, Approval, BoardColumn, Run } from "../../core/types";

/** 回答待ちの依頼があるチャットの ID（approvals を 1 回なめて作り、チャットごとの判定に使う） */
export type ApprovalIndex = ReadonlySet<number>;

export const approvalIndex = (approvals: readonly Pick<Approval, "run_id">[]): ApprovalIndex => new Set(approvals.map((a) => a.run_id));

/** チャットの状態（回答待ちの依頼があれば回答待ち。コアの agentStateOf を、回答待ちの一覧で引く） */
export const runStateOf = (run: Run, approvals: ApprovalIndex): AgentState => agentStateOf(run, approvals.has(run.id));

/** 数を出す状態（カンバンの列のうち完了を除いたもの。この順に並べる） */
export const COUNTED_COLUMNS = ["running", "needs_input", "review"] as const;

/** 状態ごとのチャット数（作業中・回答待ち・確認待ち） */
export type StateCounts = Record<Exclude<BoardColumn, "done">, number>;

/**
 * 状態ごとのチャット数。カンバンの列と同じ決め方（boardColumnOf）で数え、完了とアーカイブ済みは数えない。
 * サイドバーのプロジェクト・プロジェクトの画面の見出し・全プロジェクトの画面の見出しで同じ数になるよう、数えるのはここだけ
 */
export function stateCounts(runs: readonly Run[], pending: ApprovalIndex): StateCounts {
  const counts: StateCounts = { running: 0, needs_input: 0, review: 0 };
  for (const r of runs) {
    if (r.archived_at) continue;
    const column = boardColumnOf(runStateOf(r, pending));
    if (column !== "done") counts[column]++;
  }
  return counts;
}
