// 添付の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { Project } from "@shared/projects/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { TrashApi } from "@/features/trash/core/index";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import { sweepUnusedUploads } from "./attachmentsCleanup";
import { UploadStore } from "./uploads";
import { uploadRoutes } from "./routes/uploads";
import { chatAttachmentsOf } from "./chatAttachments";
import type { ChatAttachments } from "@/features/chat/core/index";

export { UploadStore } from "./uploads";
export { chatAttachmentsOf } from "./chatAttachments";

export interface AttachmentsEnv {
  /** 添付の置き場所（省けば保存先の uploads/） */
  dir?: string;
}

export interface AttachmentsApi {
  uploads: UploadStore;
  /** チャットの添付の口（保存先・送る文に添付のパスを書き添える） */
  forChat: ChatAttachments;
  /** ツールの結果の画像を読んでよいフォルダを足す（上の機能が登録する。notes がノートのフォルダを足す） */
  addImageDir(dirOf: (project: Project) => string): void;
  /** プロジェクトのノートのフォルダを引く口を渡す（notes が登録する。送る文にノートの写しの元のノートのパスを書き添える） */
  useNoteDir(dirOf: (project: Project) => string): void;
}

/** 添付の置き場と、添付・ツールの結果の画像の表示 */
export function createAttachments(k: Kernel, deps: { trash: TrashApi; chatStore: () => Pick<ChatStoreDeps, "chats" | "events" | "projects" | "groups"> }, env: AttachmentsEnv): CoreFeature<AttachmentsApi> {
  const uploads = new UploadStore(env.dir ?? path.join(k.paths.dataDir, "uploads"));
  // 入力欄に付けたまま送らなかった添付は、どこからも使われないまま 30 日たったら消す（ゴミ箱には入れない）
  deps.trash.addSweepStep(() => sweepUnusedUploads({ store: deps.chatStore(), uploads }));
  const imageDirs: ((project: Project) => string)[] = [];
  let noteDirOf: ((project: Project) => string) | null = null;
  return {
    name: "attachments",
    api: { uploads, forChat: chatAttachmentsOf(uploads, (p) => noteDirOf?.(p) ?? null), addImageDir: (dirOf) => void imageDirs.push(dirOf), useNoteDir: (dirOf) => void (noteDirOf = dirOf) },
    routes: [{ legacy: (app) => uploadRoutes(app, { uploads, store: deps.chatStore(), imageDirs }) }],
  };
}
