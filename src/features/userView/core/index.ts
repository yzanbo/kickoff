// 利用者が見ているものの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { ChatApi } from "@/features/chat/core/index";
import { UserViewRegistry } from "./registry";
import { userViewRoutes } from "./routes/userView";
import { userViewSchema } from "./schemas";
import { userViewToolGroup } from "./tools";

export type { UserViewRegistry } from "./registry";

/** 利用者が見ているもの（この Mac の画面のウィンドウごとの知らせと、チャットごとの送ったときの様子。AI の get_user_view が読む。保存しない） */
export function createUserView(deps: { chat: Pick<ChatApi, "store" | "onUserSend"> }): CoreFeature<UserViewRegistry> {
  const userViews = new UserViewRegistry();
  // 送る指示に添えた、送った時点の画面の様子を覚える（この Mac の画面から送ったときだけ。スマホの様子は入れない）
  deps.chat.onUserSend((chatId, { user_view, fromHost }) => {
    const view = user_view === undefined ? null : userViewSchema.safeParse(user_view);
    if (fromHost && view?.success) userViews.rememberSent(chatId, view.data);
  });
  return { name: "userView", api: userViews, aiTools: [userViewToolGroup({ store: deps.chat.store, userViews })], routes: [userViewRoutes({ userViews })] };
}
