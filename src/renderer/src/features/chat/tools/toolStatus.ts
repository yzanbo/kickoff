// ツールの呼び出しの状態（流れのツールの 1 件・まとまりの見出しの左に出すアイコンの決め方）
import type { BackgroundState } from "@shared/types";
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

/**
 * 呼び出し 1 件の状態。running: まだ動いているか（作業中のチャットのいまの作業で結果を待っているか、
 * 裏で動かしたコマンドがまだ終わっていないか。裏のコマンドは「裏で始めた」という結果がすぐ届くので、結果より先に見る）
 */
export function callStatus(call: ToolCall, running: boolean): ToolStatus {
  if (running) return "running";
  if (call.result) return call.result.data.is_error ? "failed" : "done";
  return "stopped";
}

/** 呼び出し 1 件が、まだ動いているか（active: いまの作業の中のまとまり。background: 裏でまだ動いている作業を起動した呼び出しの ID） */
export function isCallRunning(call: ToolCall, active: boolean, background: ReadonlySet<string>): boolean {
  return (active && !call.result) || background.has(call.use.data.id);
}

/** 裏でまだ動いている作業を起動した呼び出しの ID（裏で動かしたコマンドを、終わるまで流れの中でも実行中として見せる） */
export function backgroundCallIds(background: BackgroundState | null): string[] {
  return (background?.tasks ?? []).flatMap((t) => (t.tool_use_id ? [t.tool_use_id] : []));
}

/** まとまりの状態: どれかが実行中なら実行中 → 失敗があれば失敗 → 結果のないものがあれば中断 → 完了 */
export function groupStatus(statuses: readonly ToolStatus[]): ToolStatus {
  for (const s of ["running", "failed", "stopped"] as const) if (statuses.includes(s)) return s;
  return "done";
}
