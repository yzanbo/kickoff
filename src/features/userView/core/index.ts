// 利用者が見ているものの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import { UserViewRegistry } from "./registry";
import { userViewRoutes } from "./routes/userView";

export type { UserViewRegistry } from "./registry";

/** 利用者が見ているもの（この Mac の画面のウィンドウごとの知らせと、チャットごとの送ったときの様子。AI の get_user_view が読む。保存しない） */
export function createUserView(): CoreFeature<UserViewRegistry> {
  const userViews = new UserViewRegistry();
  return { name: "userView", api: userViews, routes: [{ legacy: (app) => userViewRoutes(app, { userViews }) }] };
}
