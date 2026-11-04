import type { ChatStatus } from "@shared/types";

export const CHAT_STATUS_LABELS: Record<ChatStatus, string> = {
  running: "作業中",
  completed: "完了",
  failed: "失敗",
  cancelled: "中断",
};
