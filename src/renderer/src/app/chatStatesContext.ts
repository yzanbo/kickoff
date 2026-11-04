import { createContext, useContext } from "react";
import type { AgentState, Approval, Run } from "@shared/types";
import { approvalIndex, runStateOf, type ApprovalIndex } from "@/features/chat/chatState";

/** 回答待ちの依頼の一覧から 1 回だけ作る、チャットの状態の引き当て（App が依頼の一覧を受け取るたびに作り直す） */
export interface RunStates {
  /** すべてのプロジェクトの、回答待ちの依頼 */
  approvals: Approval[];
  /** 回答待ちの依頼があるチャットの ID */
  pending: ApprovalIndex;
  /** チャットの状態（回答待ちの依頼があれば回答待ち。runStateOf と同じ） */
  stateOf: (run: Run) => AgentState;
  /** そのチャットの回答待ちの依頼の数（カードの「回答 n件」） */
  pendingCount: (runId: number) => number;
}

export function indexApprovals(approvals: Approval[]): RunStates {
  const pending = approvalIndex(approvals);
  const counts = new Map<number, number>();
  for (const a of approvals) counts.set(a.run_id, (counts.get(a.run_id) ?? 0) + 1);
  return { approvals, pending, stateOf: (run) => runStateOf(run, pending), pendingCount: (runId) => counts.get(runId) ?? 0 };
}

/** App で 1 回入れ、チャットの状態・回答待ちの数が要る部品は approvals を中継せずにここから読む */
export const ApprovalsContext = createContext<RunStates>(indexApprovals([]));
export const useRunStates = () => useContext(ApprovalsContext);
