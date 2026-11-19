// 通知の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { NotificationCenter, type DesktopNotify, type PushSender } from "./center";
import { viewingRoutes } from "./routes/viewing";
import { ViewingRegistry } from "./viewing";

export interface NotificationsEnv {
  /** この Mac の通知を出す口（Mac のアプリのメインプロセスが渡す。単体のコアにはない） */
  notify?: DesktopNotify;
  /** スマホのプッシュを送る口 */
  push: PushSender;
}

/** 通知の判断（完了・失敗・回答待ち・CI の失敗を、だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）。止める途中の知らせで通知を出さないよう先に止める */
export function createNotifications(k: KernelWithStore, env: NotificationsEnv): CoreFeature<{ viewing: ViewingRegistry }> {
  const viewing = new ViewingRegistry();
  const center = new NotificationCenter({ bus: k.bus, store: k.store, viewing, desktop: env.notify, push: env.push });
  return { name: "notifications", api: { viewing }, routes: [{ legacy: (app) => viewingRoutes(app, { viewing }) }], stop: () => center.close(), stopPhase: "first" };
}
