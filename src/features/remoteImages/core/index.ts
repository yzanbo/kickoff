// チャット欄とノートの外の画像の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ChatApi } from "@/features/chat/core/index";
import type { ChildChatsApi } from "@/features/childChats/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import { RemoteImageService, type RemoteImageServiceOptions } from "./service";
import { NoteImageService } from "./noteImageService";
import { createChatImageStore } from "./db/chatImages";
import { createNoteImageStore } from "./db/noteImages";
import { chatImageRoutes } from "./routes/chatImages";
import { noteImageRoutes } from "./routes/noteImages";

/** 取ってきた画像を覚えるフォルダ（保存先の image-cache。中はチャットごと、ノートの分は notes の下） */
export const remoteImageCacheDir = (dataDir: string) => path.join(dataDir, "image-cache");

/** ノートの外の画像の付け替え・片付け（ノートの機能が、動かした・ゴミ箱に入れたときに呼ぶ） */
export interface RemoteImagesApi {
  /** ノート（かフォルダ）を動かした（ほかのプロジェクトへ移したときも） */
  noteMoved(fromProjectId: number, from: string, toProjectId: number, to: string): Promise<void>;
  /** ノート（かフォルダ）をゴミ箱に入れた */
  noteTrashed(projectId: number, path: string): Promise<void>;
}

/**
 * チャット欄とノートの外の画像（表示を許可したホストと、取ってきた画像の覚え）。覚えは保存先の image-cache で、
 * チャットを本当に消したら忘れる。ノートの分は、ノートを動かしたら付け替え、ゴミ箱に入れたら忘れる
 */
export function createRemoteImages(
  k: Kernel,
  deps: { chat: Pick<ChatApi, "onChatsPurged" | "chatParam">; childChats: ChildChatsApi; projects: Pick<ProjectsApi, "param"> },
  env: Pick<RemoteImageServiceOptions, "fetcher">,
): CoreFeature<RemoteImagesApi> {
  const dir = remoteImageCacheDir(k.paths.dataDir);
  const publish = (e: Parameters<typeof k.bus.publish>[0]) => k.bus.publish(e);
  const remoteImages = new RemoteImageService({ store: { chatImages: createChatImageStore(k.db) }, dir, publish, fetcher: env.fetcher });
  const noteImages = new NoteImageService({ store: createNoteImageStore(k.db), dir: path.join(dir, "notes"), publish, fetcher: env.fetcher });
  deps.chat.onChatsPurged((ids) => remoteImages.forgetChats(ids));
  // 分岐したチャットには元の返答がそのまま並ぶので、外の画像の表示の許可と覚えた画像も写す
  deps.childChats.onForked((from, to) => remoteImages.copyChat(from, to));
  return {
    name: "remoteImages",
    api: {
      noteMoved: (fromProjectId, from, toProjectId, to) => noteImages.moved(fromProjectId, from, toProjectId, to),
      noteTrashed: (projectId, notePath) => noteImages.trashed(projectId, notePath),
    },
    routes: [chatImageRoutes({ chatParam: deps.chat.chatParam, remoteImages }), noteImageRoutes({ projectParam: deps.projects.param, noteImages })],
  };
}
