import type { AgentState } from "@shared/types";
import type { SubagentEntry } from "./subagents";

/**
 * サブエージェントの状態に添える細かい様子（5 つの状態だけでは分からないもの）: やり直し済み（親が新しいサブエージェントでやり直した）/
 * 通信の切断で中断 / 出力の上限で失敗 / 中断 / 報告の受け取り待ち（親がまだ動いていない）/ 報告が届いていない（親が動かずに作業が終わった）
 */
export const SUBAGENT_DETAILS = ["superseded", "network", "output_limit", "stopped", "awaiting", "undelivered"] as const;
export type SubagentDetail = (typeof SUBAGENT_DETAILS)[number];

/** サブエージェントの状態: チャット・子チャットと同じ 5 つの状態（印・まとめ）と、添える細かい様子（なければ null） */
export interface SubagentState {
  state: AgentState;
  detail: SubagentDetail | null;
}

/**
 * サブエージェント 1 つの状態（チャットの agentStateOf と同じ 5 つで語る。印・まとめ・言葉・色はすべてこれから決める）。
 * 回答待ち（waiting。このサブエージェントの承認・質問を待っている）→ 作業中 → やり直し済み（もう手を打たなくてよいので既読）→
 * 手を打つもの（失敗・通信で中断・報告が届かず）は失敗 → ほか（完了・受け取り待ち・中断）は既読
 */
export function subagentState(entry: SubagentEntry, waiting = false): SubagentState {
  if (waiting) return { state: "needs_input", detail: null };
  if (entry.status === "running") return { state: "running", detail: null };
  if (entry.supersededBy) return { state: "read", detail: "superseded" };
  if (entry.network) return { state: "failed", detail: "network" };
  if (entry.status === "failed") return { state: "failed", detail: entry.outputLimit ? "output_limit" : null };
  if (entry.status === "stopped") return { state: "read", detail: "stopped" };
  if (entry.delivery === "pending") return { state: "read", detail: "awaiting" };
  if (entry.delivery === "lost") return { state: "failed", detail: "undelivered" };
  return { state: "read", detail: null };
}
