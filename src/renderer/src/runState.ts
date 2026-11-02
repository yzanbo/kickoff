import { agentStateOf } from "../../core/board";
import type { AgentState, Approval, Run } from "../../core/types";

/** 回答待ちの依頼があるチャットの ID（approvals を 1 回なめて作り、チャットごとの判定に使う） */
export type ApprovalIndex = ReadonlySet<number>;

export const approvalIndex = (approvals: readonly Pick<Approval, "run_id">[]): ApprovalIndex => new Set(approvals.map((a) => a.run_id));

/** チャットの状態（回答待ちの依頼があれば回答待ち。コアの agentStateOf を、回答待ちの一覧で引く） */
export const runStateOf = (run: Run, approvals: ApprovalIndex): AgentState => agentStateOf(run, approvals.has(run.id));
