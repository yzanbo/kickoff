import type { DatabaseSync } from "node:sqlite";
import { createCiNoticeStore } from "./ciNotices";
import { createPrNoticeStore } from "./prNotices";

/** GitHub の表の店（PR の知らせで確認を閉じた PR・CI の失敗を知らせた実行）。createGitHub が作る */
export function createGitHubStores(db: DatabaseSync) {
  return { prNotices: createPrNoticeStore(db), ciNotices: createCiNoticeStore(db) };
}

export type GitHubStores = ReturnType<typeof createGitHubStores>;
