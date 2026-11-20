// チャット欄の外の画像の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ChatApi } from "@/features/chat/core/index";
import { RemoteImageService, type RemoteImageServiceOptions } from "./service";
import { createChatImageStore } from "./db/chatImages";
import { chatImageRoutes } from "./routes/chatImages";

export type { RemoteImageService } from "./service";

/** チャット欄の外の画像（表示を許可したホストと、取ってきた画像の覚え。覚えは保存先の image-cache で、チャットを本当に消したら忘れる） */
export function createRemoteImages(k: Kernel, deps: { chat: Pick<ChatApi, "onChatsPurged" | "store"> }, env: Pick<RemoteImageServiceOptions, "fetcher">): CoreFeature<RemoteImageService> {
  const remoteImages = new RemoteImageService({ store: { chatImages: createChatImageStore(k.db) }, dir: path.join(k.paths.dataDir, "image-cache"), publish: (e) => k.bus.publish(e), fetcher: env.fetcher });
  deps.chat.onChatsPurged((ids) => remoteImages.forgetChats(ids));
  return { name: "remoteImages", api: remoteImages, routes: [{ legacy: (app) => chatImageRoutes(app, { store: deps.chat.store, remoteImages }) }] };
}
