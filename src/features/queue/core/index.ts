// 送信待ちの機能のコアの入口（ほかの機能はここだけを読む。送信待ちの中身と口は chat の殻）
import type { CoreFeature } from "@/foundation/core/feature";
import type { ChatApi } from "@/features/chat/core/index";
import { queueRoutes } from "./routes";

/** 送信待ち: 起動したときの再開の確かめのルート */
export function createQueue(deps: { chat: Pick<ChatApi, "runner"> }): CoreFeature {
  return { name: "queue", api: {}, routes: [queueRoutes({ runner: deps.chat.runner })] };
}
