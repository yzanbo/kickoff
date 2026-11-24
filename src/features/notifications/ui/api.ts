// 通知の API の呼び手（取り決めは @shared/notifications/contract.ts。コアの受け口は core/routes/viewing.ts）
import { notificationsContract } from "@shared/notifications/contract";
import type { ViewingBody } from "@shared/notifications/types";
import { client } from "@/foundation/ui/api/client";

export const notificationsApi = client(notificationsContract);

/** 窓を閉じる・読み込み直すときに「何も見ていない」を知らせる（ページが消えても届くよう keepalive。返事は待たない） */
export const reportLeaving = () =>
  void notificationsApi("PUT /api/viewing", { body: { chat_id: null, ci_project_id: null } satisfies ViewingBody }, { keepalive: true }).catch(() => {});
