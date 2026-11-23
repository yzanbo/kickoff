// 利用者が見ているものを知らせる口（コアの受け口は core/routes/userView.ts。この Mac の画面だけ）
import type { UserViewBody } from "@shared/userView/types";
import { request } from "@/foundation/ui/api/http";

export const userViewApi = {
  /** 利用者が見ているもの（このウィンドウのペインごとの前のタブなど。AI の get_user_view が読む） */
  reportUserView: (body: UserViewBody) => request<void>("PUT", "/api/user-view", body),
  /** 窓を閉じる・読み込み直すときに、このウィンドウを忘れてもらう（keepalive。返事は待たない） */
  reportUserViewClosed: (windowId: string) =>
    void request<void>("PUT", "/api/user-view", { window_id: windowId, view: null, chat_ids: [], focused: false } satisfies UserViewBody, { keepalive: true }).catch(() => {}),
};
