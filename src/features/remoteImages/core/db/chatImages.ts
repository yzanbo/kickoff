import type { DatabaseSync } from "node:sqlite";
import { createImageTables } from "./imageTables";

/**
 * チャット欄の外の画像（chat_image_hosts・chat_image_cache の表）。
 * 許可したホストはチャットごと。知らせ（SSE）は呼ぶ側（ChatImageService）が出す
 */
export function createChatImageStore(db: DatabaseSync) {
  return {
    ...createImageTables(db, { hosts: "chat_image_hosts", cache: "chat_image_cache", scope: "chat_id" }),
    /** 許可と覚え書きを別のチャットに写す（分岐。写した画像の key を返す。ファイルは呼ぶ側が写す） */
    copy(fromChatId: number, toChatId: number): string[] {
      db.prepare("INSERT OR IGNORE INTO chat_image_hosts (chat_id, host, allowed_at) SELECT ?, host, allowed_at FROM chat_image_hosts WHERE chat_id = ?").run(toChatId, fromChatId);
      return (
        db
          .prepare("INSERT OR IGNORE INTO chat_image_cache (chat_id, key, host, content_type, size, fetched_at) SELECT ?, key, host, content_type, size, fetched_at FROM chat_image_cache WHERE chat_id = ? RETURNING key")
          .all(toChatId, fromChatId) as { key: string }[]
      ).map((r) => r.key);
    },
  };
}
