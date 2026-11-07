import type { AgentState, Approval, ChatEvent } from "@shared/types";
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

/**
 * 回答待ちの依頼（承認・質問）を出しているサブエージェント（一覧の行のキー）。依頼の呼び出し ID（tool_use_id）の記録の parent から引き、
 * 中の手順が届かない深い入れ子などで記録にないときは、サブエージェントの ID（agent_id）で引く。メインエージェントの依頼・再開の確かめは数えない
 */
export function waitingSubagentKeys(
  approvals: readonly Pick<Approval, "kind" | "tool_use_id" | "agent_id">[],
  events: readonly ChatEvent[],
  entries: readonly SubagentEntry[],
): Set<string> {
  const keys = new Set<string>();
  const asking = approvals.filter((a) => (a.kind === "permission" || a.kind === "question") && (a.tool_use_id || a.agent_id));
  if (asking.length === 0 || entries.length === 0) return keys;
  // 記録の parent（起動した呼び出し ID。SendMessage で再開した回はその ID）→ 一覧の行のキー
  const entryOfScope = new Map<string, string>();
  for (const e of entries) for (const scope of [e.key, ...(e.aliases ?? [])]) entryOfScope.set(scope, e.key);
  const wanted = new Set(asking.map((a) => a.tool_use_id).filter(Boolean));
  const parentOf = new Map<string, string>();
  for (const ev of events) if (ev.type === "tool_use" && ev.data.parent && wanted.has(ev.data.id)) parentOf.set(ev.data.id, ev.data.parent);
  for (const a of asking) {
    const parent = a.tool_use_id ? parentOf.get(a.tool_use_id) : undefined;
    const key = (parent && entryOfScope.get(parent)) || (a.agent_id ? entries.find((e) => e.agentId === a.agent_id)?.key : undefined);
    if (key) keys.add(key);
  }
  return keys;
}
