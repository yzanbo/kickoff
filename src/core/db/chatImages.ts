import type { DatabaseSync } from "node:sqlite";
import type { ChatImageHost } from "@shared/types";

/** 取ってきた画像の覚え書き（中身はファイル。core/remoteImages/service.ts） */
export interface CachedImage {
  chat_id: number;
  key: string;
  host: string;
  content_type: string;
  size: number;
  fetched_at: string;
}

/**
 * チャット欄の外の画像（chat_image_hosts・chat_image_cache の表。メモの仕様書「0027_チャット欄の外の画像とリンク」）。
 * 許可したホストはチャットごと。知らせ（SSE）は呼ぶ側（RemoteImageService）が出す
 */
export function createChatImageStore(db: DatabaseSync) {
  return {
    /** そのチャットで表示を許可したホスト（許可した順） */
    hosts(chatId: number): ChatImageHost[] {
      return db.prepare("SELECT host, allowed_at FROM chat_image_hosts WHERE chat_id = ? ORDER BY allowed_at, host").all(chatId) as unknown as ChatImageHost[];
    },
    allowed(chatId: number, host: string): boolean {
      return db.prepare("SELECT 1 FROM chat_image_hosts WHERE chat_id = ? AND host = ?").get(chatId, host) !== undefined;
    },
    /** 許可する（もう許可していれば何もしない） */
    allow(chatId: number, host: string): void {
      db.prepare("INSERT OR IGNORE INTO chat_image_hosts (chat_id, host) VALUES (?, ?)").run(chatId, host);
    },
    /** 許可を外す（そのホストの覚え書きも消し、消した画像の key を返す。ファイルは呼ぶ側が消す） */
    revoke(chatId: number, host: string): string[] {
      db.prepare("DELETE FROM chat_image_hosts WHERE chat_id = ? AND host = ?").run(chatId, host);
      const keys = db.prepare("SELECT key FROM chat_image_cache WHERE chat_id = ? AND host = ?").all(chatId, host) as { key: string }[];
      db.prepare("DELETE FROM chat_image_cache WHERE chat_id = ? AND host = ?").run(chatId, host);
      return keys.map((k) => k.key);
    },
    /** 許可と覚え書きを別のチャットに写す（分岐。写した覚え書きを返す。ファイルは呼ぶ側が写す） */
    copy(fromChatId: number, toChatId: number): CachedImage[] {
      db.prepare("INSERT OR IGNORE INTO chat_image_hosts (chat_id, host, allowed_at) SELECT ?, host, allowed_at FROM chat_image_hosts WHERE chat_id = ?").run(toChatId, fromChatId);
      const rows = db.prepare("SELECT * FROM chat_image_cache WHERE chat_id = ?").all(fromChatId) as unknown as CachedImage[];
      const insert = db.prepare("INSERT OR IGNORE INTO chat_image_cache (chat_id, key, host, content_type, size, fetched_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const r of rows) insert.run(toChatId, r.key, r.host, r.content_type, r.size, r.fetched_at);
      return rows;
    },
    cached(chatId: number, key: string): CachedImage | undefined {
      return db.prepare("SELECT * FROM chat_image_cache WHERE chat_id = ? AND key = ?").get(chatId, key) as unknown as CachedImage | undefined;
    },
    /** 取ってきた画像を覚える（同じ key なら書き直す） */
    remember(image: Omit<CachedImage, "fetched_at">): void {
      db.prepare(
        "INSERT INTO chat_image_cache (chat_id, key, host, content_type, size) VALUES (?, ?, ?, ?, ?) ON CONFLICT (chat_id, key) DO UPDATE SET host = excluded.host, content_type = excluded.content_type, size = excluded.size, fetched_at = excluded.fetched_at",
      ).run(image.chat_id, image.key, image.host, image.content_type, image.size);
    },
    forget(chatId: number, key: string): void {
      db.prepare("DELETE FROM chat_image_cache WHERE chat_id = ? AND key = ?").run(chatId, key);
    },
    /** 覚えている画像の大きさの合計 */
    totalSize(): number {
      return (db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM chat_image_cache").get() as { total: number }).total;
    },
    /** 古いものから n 件 */
    oldest(limit: number): CachedImage[] {
      return db.prepare("SELECT * FROM chat_image_cache ORDER BY fetched_at, chat_id, key LIMIT ?").all(limit) as unknown as CachedImage[];
    },
  };
}
