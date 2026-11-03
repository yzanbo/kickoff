import type { SubagentEntry } from "../../../../core/subagents";

/** サブエージェントの状態の表示名 */
export const SUBAGENT_STATUS_LABELS: Record<SubagentEntry["status"], string> = {
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  stopped: "中断",
};

/**
 * 一覧・タブに出す状態。通信の切断で止まったものは「通信の切断で中断」、出力の上限で止まったものは「失敗（出力の上限）」。
 * 完了は、報告が親に届いたかで分ける（受け取った = 完了 / まだ親が動いていない = 受け取り待ち / 親が動かずに作業が終わった = 届いていない）
 */
export function subagentStatusLabel(entry: SubagentEntry): string {
  // 止まったあと、親が新しいサブエージェントでやり直したもの（もう手を打たなくてよい。止まった理由は subagentStatusTitle）
  if (entry.supersededBy) return "やり直し済み";
  return haltedLabel(entry);
}

/** 状態の文に乗せたときの説明（やり直し済みは、止まった理由とやり直した回の名前） */
export function subagentStatusTitle(entry: SubagentEntry): string | undefined {
  return entry.supersededBy ? `${haltedLabel(entry)}のあと、親のエージェントが「${entry.supersededBy.description}」としてやり直しています` : undefined;
}

function haltedLabel(entry: SubagentEntry): string {
  if (entry.network) return "通信の切断で中断";
  if (entry.status === "failed" && entry.outputLimit) return "失敗（出力の上限）";
  if (entry.status === "completed" && entry.delivery === "pending") return "報告済み（親の受け取り待ち）";
  if (entry.status === "completed" && entry.delivery === "lost") return "報告が親に届いていません";
  return SUBAGENT_STATUS_LABELS[entry.status];
}

/** 状態の色のクラス（status-*。通信の切断・受け取り待ち・届いていないは、ほかの失敗・完了と色を分ける） */
export function subagentStatusClass(entry: SubagentEntry): string {
  if (entry.supersededBy) return "status-superseded";
  if (entry.network) return "status-network";
  if (entry.status === "completed" && entry.delivery === "pending") return "status-awaiting";
  if (entry.status === "completed" && entry.delivery === "lost") return "status-undelivered";
  return `status-${entry.status}`;
}

/** 一覧の行に状態を出すか（親が受け取った完了は、いつもの完了なので出さない） */
export function showsSubagentStatus(entry: SubagentEntry): boolean {
  return entry.status !== "completed" || (entry.delivery !== undefined && entry.delivery !== "received");
}

/** 止まったサブエージェント（再開・やり直しのボタンを出す。親がもうやり直したものは除く） */
export function isSubagentHalted(entry: SubagentEntry): boolean {
  return (entry.status === "failed" || entry.status === "stopped") && !entry.supersededBy;
}
