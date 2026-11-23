// 通知の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { ProjectStore } from "@/features/projects/core/index";
import type { ChatStatus } from "@shared/chat/types";
import { NotificationCenter, type DesktopNotify, type PushSender, type PushTargets } from "./center";
export type { PushMessage, PushResult, PushSender } from "./center";
import { notifyToolGroup } from "./tools";
import { viewingRoutes } from "./routes/viewing";
import { ViewingRegistry } from "./viewing";

/** 通知が読む店（chat と devices はあとに作るので、組み立てが呼ばれたときに引く関数を渡す） */
export interface NotificationsDeps {
  chatStore: () => Pick<ChatStoreDeps, "chats" | "events">;
  devices: () => PushTargets;
  projects: ProjectStore;
}

export interface NotificationsApi {
  viewing: ViewingRegistry;
  /** チャットの 1 回の実行が終わった（組み立てが chat の殻の onTurnEnded をつなぐ。最後まで終わった・失敗したら知らせる） */
  turnEnded(chatId: number, status: ChatStatus): void;
}

export interface NotificationsEnv {
  /** この Mac の通知を出す口（Mac のアプリのメインプロセスが渡す。単体のコアにはない） */
  notify?: DesktopNotify;
  /** スマホのプッシュを送る口 */
  push: PushSender;
}

/** 通知の判断（完了・失敗・回答待ち・CI の失敗を、だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）と、AI が知らせるツール。止める途中の知らせで通知を出さないよう先に止める */
export function createNotifications(k: Kernel, deps: NotificationsDeps, env: NotificationsEnv): CoreFeature<NotificationsApi> {
  const viewing = new ViewingRegistry();
  const center = new NotificationCenter({ bus: k.bus, store: { get chats() { return deps.chatStore().chats; }, projects: deps.projects, settings: k.settings, databaseId: k.paths.databaseId, get devices() { return deps.devices(); } }, viewing, desktop: env.notify, push: env.push });
  const aiTools = [notifyToolGroup({ store: deps.chatStore, publish: (e) => k.bus.publish(e) })];
  return { name: "notifications", api: { viewing, turnEnded: (chatId, status) => center.turnEnded(chatId, status) }, routes: [{ legacy: (app) => viewingRoutes(app, { viewing }) }], aiTools, stop: () => center.close(), stopPhase: "first" };
}
