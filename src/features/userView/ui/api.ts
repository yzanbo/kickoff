// 利用者が見ているものを知らせる呼び手（取り決めは @shared/userView/contract.ts。コアの受け口は core/routes/userView.ts。この Mac の画面だけ）
import { userViewContract } from "@shared/userView/contract";
import type { UserViewBody } from "@shared/userView/types";
import { client } from "@/foundation/ui/api/client";

export const userViewApi = client(userViewContract);

/** 窓を閉じる・読み込み直すときに、このウィンドウを忘れてもらう（keepalive。返事は待たない） */
export const reportUserViewClosed = (windowId: string) =>
  void userViewApi("PUT /api/user-view", { body: { window_id: windowId, view: null, chat_ids: [], focused: false } satisfies UserViewBody }, { keepalive: true }).catch(() => {});
