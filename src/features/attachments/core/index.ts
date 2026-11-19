// 添付の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { Project } from "@shared/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { TrashApi } from "@/features/trash/core/index";
import { sweepUnusedUploads } from "./attachmentsCleanup";
import { UploadStore } from "./uploads";
import { uploadRoutes } from "./routes/uploads";

export type { UploadStore } from "./uploads";

export interface AttachmentsEnv {
  /** 添付の置き場所（省けば保存先の uploads/） */
  dir?: string;
}

export interface AttachmentsApi {
  uploads: UploadStore;
  /** ツールの結果の画像を読んでよいフォルダを足す（上の機能が登録する。notes がノートのフォルダを足す） */
  addImageDir(dirOf: (project: Project) => string): void;
}

/** 添付の置き場と、添付・ツールの結果の画像の表示 */
export function createAttachments(k: KernelWithStore, deps: { trash: TrashApi }, env: AttachmentsEnv): CoreFeature<AttachmentsApi> {
  const uploads = new UploadStore(env.dir ?? path.join(k.paths.dataDir, "uploads"));
  // 入力欄に付けたまま送らなかった添付は、どこからも使われないまま 30 日たったら消す（ゴミ箱には入れない）
  deps.trash.addSweepStep(() => sweepUnusedUploads({ store: k.store, uploads }));
  const imageDirs: ((project: Project) => string)[] = [];
  return {
    name: "attachments",
    api: { uploads, addImageDir: (dirOf) => void imageDirs.push(dirOf) },
    routes: [{ legacy: (app) => uploadRoutes(app, { uploads, store: k.store, imageDirs }) }],
  };
}
