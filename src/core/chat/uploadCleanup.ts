// 入力欄に付けたまま送らなかった添付の片付け（メモの仕様書「ファイル削除」の Q16。2026-11-14 に利用者と決めた）。
// 添付は入力欄に付けた時点で uploads/ に保存し、入力欄の下書きは画面の中（localStorage）にあるので、コアはまだ下書きで使っているかを確かめられない。
// どこからも使われていない添付（会話の記録（ゴミ箱のチャットも）・送信待ちのどれも ID を指していないもの）は、付けてから 30 日たったら消す。
// 利用者が「消した」ものではないので、ゴミ箱には入れない
import type { Store } from "../db/store.js";
import type { UploadStore } from "./uploads.js";

/** 付けてから消すまで（金曜に書きかけて週明けに続けても消えないよう、ゴミ箱の 3 日より長く） */
export const UNUSED_UPLOAD_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** 保存してから 30 日たち、どこからも使われていない添付を消す。消した数を返す */
export async function sweepUnusedUploads(deps: { store: Store; uploads: Pick<UploadStore, "savedBefore" | "remove"> }, now = Date.now()): Promise<number> {
  let removed = 0;
  for (const id of await deps.uploads.savedBefore(now - UNUSED_UPLOAD_KEEP_MS)) {
    if (deps.store.events.uploadInUse(id)) continue;
    await deps.uploads.remove(id);
    removed++;
  }
  return removed;
}
