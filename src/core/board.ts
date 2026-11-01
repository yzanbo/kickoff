// カンバンとステータス表示の決め方（コア・画面の両方で使う。Node 依存を持ち込まないこと）
import type { AgentState, BoardStage, Run } from "./types.js";

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

/** カンバンの列。動かしていないチャットは、確認待ちならレビュー、それ以外は対応中に置く */
export function stageOf(run: Run, state: AgentState): BoardStage {
  if (run.stage) return run.stage;
  return state === "attention" ? "review" : "doing";
}
