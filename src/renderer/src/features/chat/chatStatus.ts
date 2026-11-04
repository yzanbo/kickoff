import type { RunStatus } from "@shared/types";

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: "待機中",
  running: "作業中",
  waiting: "回答待ち",
  completed: "完了",
  failed: "失敗",
  cancelled: "中断",
};

export const BUSY_STATUSES: RunStatus[] = ["queued", "running", "waiting"];
