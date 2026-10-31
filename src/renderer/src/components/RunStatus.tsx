import { Check, CircleAlert, Loader2, MessageCircleQuestion, Square } from "lucide-react";
import type { Run, RunStatus } from "../../../core/types";

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: "待機中",
  running: "作業中",
  waiting: "回答待ち",
  completed: "完了",
  failed: "失敗",
  cancelled: "中断",
};

export const BUSY_STATUSES: RunStatus[] = ["queued", "running", "waiting"];

/** チャットの状態アイコン（回答待ちは目立たせる） */
export function RunStatusIcon({ run, waiting }: { run: Run; waiting?: boolean }) {
  if (waiting || run.status === "waiting") {
    return <MessageCircleQuestion className="status-icon waiting" size={14} aria-label="回答待ち" />;
  }
  switch (run.status) {
    case "running":
    case "queued":
      return <Loader2 className="status-icon spin" size={14} aria-label="作業中" />;
    case "failed":
      return <CircleAlert className="status-icon failed" size={14} aria-label="失敗" />;
    case "cancelled":
      return <Square className="status-icon muted" size={11} aria-label="中断" />;
    default:
      return <Check className="status-icon done" size={14} aria-label="完了" />;
  }
}
