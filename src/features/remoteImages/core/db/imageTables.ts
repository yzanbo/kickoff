import type { DatabaseSync } from "node:sqlite";
import type { ImageHost } from "@shared/remoteImages/types";

/** 取ってきた画像の覚え書きの 1 行（scope は範囲の ID: チャットの ID かノートの範囲の ID。中身はファイル。imageCache.ts） */
export interface CachedImageRow {
  scope: number;
  key: string;
  host: string;
  content_type: string;
  size: number;
  fetched_at: string;
}

/** 範囲ごとの 2 つの表の名前と、範囲の列の名前（どれもコードの中の決まった名前。利用者の値を入れない） */
interface ImageTableNames {
  hosts: "chat_image_hosts" | "note_image_hosts";
  cache: "chat_image_cache" | "note_image_cache";
  scope: "chat_id" | "scope_id";
}

/**
 * 範囲ごとの、表示を許可したホストと取ってきた画像の覚え書きの表（チャットとノートで同じ形。表と範囲の列の名前だけが違う）。
 * 覚え書きの読み書きは imageCache.ts の CacheRows の形のまま渡せる
 */
export function createImageTables(db: DatabaseSync, { hosts, cache, scope }: ImageTableNames) {
  const columns = `${scope} AS scope, key, host, content_type, size, fetched_at`;
  return {
    /** その範囲で表示を許可したホスト（許可した順） */
    hosts(id: number): ImageHost[] {
      return db.prepare(`SELECT host, allowed_at FROM ${hosts} WHERE ${scope} = ? ORDER BY allowed_at, host`).all(id) as unknown as ImageHost[];
    },
    allowed(id: number, host: string): boolean {
      return db.prepare(`SELECT 1 FROM ${hosts} WHERE ${scope} = ? AND host = ?`).get(id, host) !== undefined;
    },
    /** 許可する（もう許可していれば何もしない） */
    allow(id: number, host: string): void {
      db.prepare(`INSERT OR IGNORE INTO ${hosts} (${scope}, host) VALUES (?, ?)`).run(id, host);
    },
    /** 許可を外す（そのホストの覚え書きも消し、消した画像の key を返す。ファイルは呼ぶ側が消す） */
    revoke(id: number, host: string): string[] {
      db.prepare(`DELETE FROM ${hosts} WHERE ${scope} = ? AND host = ?`).run(id, host);
      return (db.prepare(`DELETE FROM ${cache} WHERE ${scope} = ? AND host = ? RETURNING key`).all(id, host) as { key: string }[]).map((r) => r.key);
    },
    cached(id: number, key: string): CachedImageRow | undefined {
      return db.prepare(`SELECT ${columns} FROM ${cache} WHERE ${scope} = ? AND key = ?`).get(id, key) as unknown as CachedImageRow | undefined;
    },
    /** 取ってきた画像を覚える（同じ key なら書き直す） */
    remember(row: Omit<CachedImageRow, "fetched_at">): void {
      db.prepare(
        `INSERT INTO ${cache} (${scope}, key, host, content_type, size) VALUES (?, ?, ?, ?, ?) ON CONFLICT (${scope}, key) DO UPDATE SET host = excluded.host, content_type = excluded.content_type, size = excluded.size, fetched_at = excluded.fetched_at`,
      ).run(row.scope, row.key, row.host, row.content_type, row.size);
    },
    forget(id: number, key: string): void {
      db.prepare(`DELETE FROM ${cache} WHERE ${scope} = ? AND key = ?`).run(id, key);
    },
    /** 覚えている画像の大きさの合計 */
    totalSize(): number {
      return (db.prepare(`SELECT COALESCE(SUM(size), 0) AS total FROM ${cache}`).get() as { total: number }).total;
    },
    /** 古いものから n 件 */
    oldest(limit: number): CachedImageRow[] {
      return db.prepare(`SELECT ${columns} FROM ${cache} ORDER BY fetched_at, ${scope}, key LIMIT ?`).all(limit) as unknown as CachedImageRow[];
    },
  };
}
