// チャット欄の外の画像の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ChatApi } from "@/features/chat/core/index";
import type { ChildChatsApi } from "@/features/childChats/core/index";
import { RemoteImageService, type RemoteImageServiceOptions } from "./service";
import { createChatImageStore } from "./db/chatImages";
import { chatImageRoutes } from "./routes/chatImages";

/** 取ってきた画像を覚えるフォルダ（保存先の image-cache。中はチャットごと） */
export const remoteImageCacheDir = (dataDir: string) => path.join(dataDir, "image-cache");

/** チャット欄の外の画像（表示を許可したホストと、取ってきた画像の覚え。覚えは保存先の image-cache で、チャットを本当に消したら忘れる） */
export function createRemoteImages(k: Kernel, deps: { chat: Pick<ChatApi, "onChatsPurged" | "chatParam">; childChats: ChildChatsApi }, env: Pick<RemoteImageServiceOptions, "fetcher">): CoreFeature<null> {
  const remoteImages = new RemoteImageService({ store: { chatImages: createChatImageStore(k.db) }, dir: remoteImageCacheDir(k.paths.dataDir), publish: (e) => k.bus.publish(e), fetcher: env.fetcher });
  deps.chat.onChatsPurged((ids) => remoteImages.forgetChats(ids));
  // 分岐したチャットには元の返答がそのまま並ぶので、外の画像の表示の許可と覚えた画像も写す
  deps.childChats.onForked((from, to) => remoteImages.copyChat(from, to));
  return { name: "remoteImages", api: null, routes: [chatImageRoutes({ chatParam: deps.chat.chatParam, remoteImages })] };
}
