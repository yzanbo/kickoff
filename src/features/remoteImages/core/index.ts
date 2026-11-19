// チャット欄の外の画像の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { RemoteImageService, type RemoteImageServiceOptions } from "./service";
import { chatImageRoutes } from "./routes/chatImages";

export type { RemoteImageService } from "./service";

/** チャット欄の外の画像（表示を許可したホストと、取ってきた画像の覚え。覚えは保存先の image-cache） */
export function createRemoteImages(k: KernelWithStore, env: Pick<RemoteImageServiceOptions, "fetcher">): CoreFeature<RemoteImageService> {
  const remoteImages = new RemoteImageService({ store: k.store, dir: path.join(k.paths.dataDir, "image-cache"), publish: (e) => k.bus.publish(e), fetcher: env.fetcher });
  return { name: "remoteImages", api: remoteImages, routes: [{ legacy: (app) => chatImageRoutes(app, { store: k.store, remoteImages }) }] };
}
