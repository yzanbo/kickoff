// 送信待ちの取り決め（起動したときの再開の確かめ）。受け口は src/features/queue/core/routes.ts（1 件ごとの送信待ちの口は chat）
import { route, type Contract } from "@shared/foundation/contract";
import type { RestartResume } from "@shared/chat/chatLive";
import type { RestartResumeBody } from "@shared/queue/types";

export const queueContract = {
  /** 起動したときの再開の確かめ（前回の終了で作業の途中で止まった・自動で送るまま送信待ちが残ったチャット） */
  "GET /api/restart-resumes": route<never, RestartResume[]>({ access: "device" }),
  /** チャットごとに続けるか決める。決めたあとの一覧 */
  "POST /api/restart-resumes": route<RestartResumeBody, RestartResume[]>({ access: "device" }),
} as const satisfies Contract;
