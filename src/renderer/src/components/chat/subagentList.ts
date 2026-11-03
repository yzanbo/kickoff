import type { SubagentEntry } from "../../../../core/subagents";

/** サブエージェントの状態の表示名 */
export const SUBAGENT_STATUS_LABELS: Record<SubagentEntry["status"], string> = {
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  stopped: "中断",
};

/** 一覧・タブに出す状態（通信の切断で止まったものは、失敗でも中断でも「通信の切断で中断」） */
export function subagentStatusLabel(entry: SubagentEntry): string {
  return entry.network ? "通信の切断で中断" : SUBAGENT_STATUS_LABELS[entry.status];
}

/** 止まったサブエージェント（再開・やり直しのボタンを出す） */
export function isSubagentHalted(entry: SubagentEntry): boolean {
  return entry.status === "failed" || entry.status === "stopped";
}
