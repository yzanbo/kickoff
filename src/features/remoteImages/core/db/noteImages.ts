import type { DatabaseSync } from "node:sqlite";
import type { ImageHost } from "@shared/remoteImages/types";

/** ノートのために取ってきた画像の覚え書き（中身はファイル。imageCache.ts） */
export interface CachedNoteImage {
  scope_id: number;
  key: string;
  host: string;
  content_type: string;
  size: number;
  fetched_at: string;
}

/** path がノート from か、フォルダ from の中か（SQL の条件と値。フォルダごと動かした・ゴミ箱に入れたときに中のノートも扱う） */
const under = (from: string) => ({ where: "(path = ? OR substr(path, 1, ?) = ?)", values: [from, from.length + 1, `${from}/`] as const });

/**
 * ノートの外の画像（note_image_scopes・note_image_hosts・note_image_cache の表）。許可と覚え書きはノートの範囲（scope）の行にぶら下げる。
 * 知らせ（SSE）は呼ぶ側（NoteImageService）が出す
 */
export function createNoteImageStore(db: DatabaseSync) {
  const scopeId = (projectId: number, path: string): number | null =>
    (db.prepare("SELECT id FROM note_image_scopes WHERE project_id = ? AND path = ?").get(projectId, path) as { id: number } | undefined)?.id ?? null;
  return {
    /** ノートの範囲の ID（create なら、なければ作る。作らずになければ null） */
    scope(projectId: number, path: string, create = false): number | null {
      const id = scopeId(projectId, path);
      if (id !== null || !create) return id;
      return Number(db.prepare("INSERT INTO note_image_scopes (project_id, path) VALUES (?, ?)").run(projectId, path).lastInsertRowid);
    },
    hosts(scope: number | null): ImageHost[] {
      if (scope === null) return [];
      return db.prepare("SELECT host, allowed_at FROM note_image_hosts WHERE scope_id = ? ORDER BY allowed_at, host").all(scope) as unknown as ImageHost[];
    },
    allowed(scope: number | null, host: string): boolean {
      return scope !== null && db.prepare("SELECT 1 FROM note_image_hosts WHERE scope_id = ? AND host = ?").get(scope, host) !== undefined;
    },
    allow(scope: number, host: string): void {
      db.prepare("INSERT OR IGNORE INTO note_image_hosts (scope_id, host) VALUES (?, ?)").run(scope, host);
    },
    /** 許可を外す（そのホストの覚え書きも消し、消した画像の key を返す。ファイルは呼ぶ側が消す） */
    revoke(scope: number, host: string): string[] {
      db.prepare("DELETE FROM note_image_hosts WHERE scope_id = ? AND host = ?").run(scope, host);
      const keys = db.prepare("SELECT key FROM note_image_cache WHERE scope_id = ? AND host = ?").all(scope, host) as { key: string }[];
      db.prepare("DELETE FROM note_image_cache WHERE scope_id = ? AND host = ?").run(scope, host);
      return keys.map((k) => k.key);
    },
    /**
     * ノート（かフォルダ）from を動かした: 中のノートの範囲の path を書き換える（許可も覚えた画像も付いていく）。行き先に古い範囲が残っていれば先に消す。
     * 動かした範囲（ID と新しいパス）と、消した古い範囲の ID を返す（古い範囲のファイルは呼ぶ側が消す）
     */
    move(fromProject: number, from: string, toProject: number, to: string): { moved: { id: number; path: string }[]; dropped: number[] } {
      const { where, values } = under(from);
      const rows = db.prepare(`SELECT id, path FROM note_image_scopes WHERE project_id = ? AND ${where}`).all(fromProject, ...values) as { id: number; path: string }[];
      const moved = rows.map((r) => ({ id: r.id, path: to + r.path.slice(from.length) }));
      const dropped: number[] = [];
      for (const m of moved) {
        const stale = scopeId(toProject, m.path);
        if (stale !== null && stale !== m.id) {
          db.prepare("DELETE FROM note_image_scopes WHERE id = ?").run(stale);
          dropped.push(stale);
        }
        db.prepare("UPDATE note_image_scopes SET project_id = ?, path = ? WHERE id = ?").run(toProject, m.path, m.id);
      }
      return { moved, dropped };
    },
    /** ノート（かフォルダ）の範囲を消す（許可と覚え書きも一緒に。消した範囲の ID を返す。ファイルは呼ぶ側が消す） */
    forgetUnder(projectId: number, path: string): number[] {
      const { where, values } = under(path);
      const ids = (db.prepare(`SELECT id FROM note_image_scopes WHERE project_id = ? AND ${where}`).all(projectId, ...values) as { id: number }[]).map((r) => r.id);
      for (const id of ids) db.prepare("DELETE FROM note_image_scopes WHERE id = ?").run(id);
      return ids;
    },
    /** いまある範囲の ID（ファイルだけ残った範囲を片付けるため） */
    scopeIds(): Set<number> {
      return new Set((db.prepare("SELECT id FROM note_image_scopes").all() as { id: number }[]).map((r) => r.id));
    },
    cached(scope: number, key: string): CachedNoteImage | undefined {
      return db.prepare("SELECT * FROM note_image_cache WHERE scope_id = ? AND key = ?").get(scope, key) as unknown as CachedNoteImage | undefined;
    },
    remember(image: Omit<CachedNoteImage, "fetched_at">): void {
      db.prepare(
        "INSERT INTO note_image_cache (scope_id, key, host, content_type, size) VALUES (?, ?, ?, ?, ?) ON CONFLICT (scope_id, key) DO UPDATE SET host = excluded.host, content_type = excluded.content_type, size = excluded.size, fetched_at = excluded.fetched_at",
      ).run(image.scope_id, image.key, image.host, image.content_type, image.size);
    },
    forget(scope: number, key: string): void {
      db.prepare("DELETE FROM note_image_cache WHERE scope_id = ? AND key = ?").run(scope, key);
    },
    totalSize(): number {
      return (db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM note_image_cache").get() as { total: number }).total;
    },
    oldest(limit: number): CachedNoteImage[] {
      return db.prepare("SELECT * FROM note_image_cache ORDER BY fetched_at, scope_id, key LIMIT ?").all(limit) as unknown as CachedNoteImage[];
    },
  };
}
