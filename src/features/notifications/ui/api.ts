// いま見ているものを知らせる口（コアの受け口は core/routes/viewing.ts。この Mac の画面も端末も使う）
import type { ViewingBody } from "@shared/notifications/types";
import { request } from "@/foundation/ui/api/http";

export const viewingApi = {
  /** いま見ているもの（だれかが見ているチャット・CI のタブの知らせは通知しない） */
  reportViewing: (body: ViewingBody) => request<void>("PUT", "/api/viewing", body),
  /** 窓を閉じる・読み込み直すときに「何も見ていない」を知らせる（ページが消えても届くよう keepalive。返事は待たない） */
  reportLeaving: () => void request<void>("PUT", "/api/viewing", { chat_id: null, ci_project_id: null } satisfies ViewingBody, { keepalive: true }).catch(() => {}),
};
