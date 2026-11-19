// 添付の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { TrashApi } from "@/features/trash/core/index";
import { sweepUnusedUploads } from "./attachmentsCleanup";
import { UploadStore } from "./uploads";

export type { UploadStore } from "./uploads";

export interface AttachmentsEnv {
  /** 添付の置き場所（省けば保存先の uploads/） */
  dir?: string;
}

/** 添付の置き場（表示のルートはまだ仮の機能 legacy。ノートのフォルダの画像も読むため） */
export function createAttachments(k: KernelWithStore, deps: { trash: TrashApi }, env: AttachmentsEnv): CoreFeature<UploadStore> {
  const uploads = new UploadStore(env.dir ?? path.join(k.paths.dataDir, "uploads"));
  // 入力欄に付けたまま送らなかった添付は、どこからも使われないまま 30 日たったら消す（ゴミ箱には入れない）
  deps.trash.addSweepStep(() => sweepUnusedUploads({ store: k.store, uploads }));
  return { name: "attachments", api: uploads };
}
