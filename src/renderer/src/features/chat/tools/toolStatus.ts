// ツールの呼び出しの状態（流れのツールの 1 件・まとまりの見出しの左に出すアイコンの決め方）
import type { ToolCall } from "@/features/chat/timeline/timelineItems";

/** running = 実行中 / done = 完了 / failed = 失敗 / stopped = 結果が届かないまま終わった（中断） */
export const TOOL_STATUSES = ["running", "done", "failed", "stopped"] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const TOOL_STATUS_LABELS: Record<ToolStatus, string> = {
  running: "実行中",
  done: "完了",
  failed: "失敗",
  stopped: "中断（結果が届いていません）",
};

/** 呼び出し 1 件の状態（running: 作業中のチャットのいまの作業で、結果を待っているか） */
export function callStatus(call: ToolCall, running: boolean): ToolStatus {
  if (call.result) return call.result.data.is_error ? "failed" : "done";
  return running ? "running" : "stopped";
}

/** まとまりの状態: どれかが実行中なら実行中 → 失敗があれば失敗 → 結果のないものがあれば中断 → 完了 */
export function groupStatus(statuses: readonly ToolStatus[]): ToolStatus {
  for (const s of ["running", "failed", "stopped"] as const) if (statuses.includes(s)) return s;
  return "done";
}
