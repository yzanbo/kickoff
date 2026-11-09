import { AGENT_STATE_LABELS, type AgentState } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { subagentState, type SubagentDetail, type SubagentState } from "@shared/chat/subagentState";

/** サブエージェントの状態の文（細かい様子がないとき）。チャット・子チャットと同じ言葉（AGENT_STATE_LABELS）で、未読・既読の区別のないサブエージェントは「完了」 */
const SUBAGENT_STATE_LABELS: Record<AgentState, string> = { ...AGENT_STATE_LABELS, unread: "完了", read: "完了" };

/** 細かい様子の文（通信の切断・出力の上限・受け取り待ち・届いていない・中断・やり直し済み） */
const SUBAGENT_DETAIL_LABELS: Record<SubagentDetail, string> = {
  superseded: "やり直し済み",
  network: "通信の切断で中断",
  output_limit: "失敗（出力の上限）",
  stopped: "中断",
  awaiting: "報告済み（受け取り待ち）",
  undelivered: "報告が届いていません",
};

/** 状態の文（細かい様子があればその文、なければ 5 つの状態の文） */
export function subagentStateText({ state, detail }: SubagentState): string {
  return detail ? SUBAGENT_DETAIL_LABELS[detail] : SUBAGENT_STATE_LABELS[state];
}

/**
 * 一覧・カード・タブに出す状態の文（waiting: このサブエージェントが回答待ちの依頼を出している = 「回答待ち」）。通信の切断で止まったものは「通信の切断で中断」、出力の上限で止まったものは「失敗（出力の上限）」。
 * 完了は、報告が親に届いたかで分ける（受け取った = 完了 / まだ親が動いていない = 受け取り待ち / 親が動かずに作業が終わった = 届いていない）。
 * 止まったあと、起動したエージェントが新しいサブエージェントでやり直したものは「やり直し済み」（止まった理由は subagentStatusTitle）
 */
export function subagentStatusLabel(entry: SubagentEntry, waiting = false): string {
  return subagentStateText(subagentState(entry, waiting));
}

/** 状態の文に乗せたときの説明（やり直し済みは、止まった理由とやり直した回の名前） */
export function subagentStatusTitle(entry: SubagentEntry): string | undefined {
  if (!entry.supersededBy) return undefined;
  return `${subagentStatusLabel({ ...entry, supersededBy: undefined })}のあと、起動したエージェントが「${entry.supersededBy.description}」としてやり直しています`;
}

/** 状態の色のクラス（status-*。回答待ち・通信の切断・受け取り待ち・届いていない・やり直し済みは、ほかの失敗・完了と色を分ける） */
export function subagentStatusClass(entry: SubagentEntry, waiting = false): string {
  const { state, detail } = subagentState(entry, waiting);
  if (state === "needs_input") return "status-needs-input";
  if (detail === "superseded" || detail === "network" || detail === "awaiting" || detail === "undelivered") return `status-${detail}`;
  return `status-${entry.status}`;
}

/** 状態の文を出すか（親が受け取った完了は、いつもの完了なので出さない） */
export function showsSubagentStatus(entry: SubagentEntry, waiting = false): boolean {
  const { state, detail } = subagentState(entry, waiting);
  return state !== "read" || detail !== null;
}

/** 止まったサブエージェント（再開・やり直しのボタンを出す。親がもうやり直したものは除く） */
export function isSubagentHalted(entry: SubagentEntry): boolean {
  return (entry.status === "failed" || entry.status === "stopped") && !entry.supersededBy;
}
