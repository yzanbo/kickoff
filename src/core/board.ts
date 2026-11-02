// カンバンとステータス表示の決め方（コア・画面の両方で使う。Node 依存を持ち込まないこと）
import type { AgentState, BoardColumn, Run } from "./types.js";

/**
 * チャットのエージェントの状態優先順位:
 * 回答待ち → エラー → 作業中 → 確認待ち → 待機中
 */
export function agentStateOf(run: Run, hasPendingApproval: boolean): AgentState {
  if (hasPendingApproval || run.status === "waiting") return "needs_input";
  if (run.status === "failed") return "failed";
  if (run.status === "running" || run.status === "queued") return "running";
  if (run.attention) return "attention";
  return "done";
}

/** カンバンの列（AI の状態だけで決まる。失敗したものも、見て確かめるまでは確認待ち） */
export function boardColumnOf(state: AgentState): BoardColumn {
  if (state === "running") return "running";
  if (state === "needs_input") return "needs_input";
  if (state === "attention" || state === "failed") return "review";
  return "done";
}
