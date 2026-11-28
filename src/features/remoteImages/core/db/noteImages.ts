import type { DatabaseSync } from "node:sqlite";
import type { ChatImageHost } from "@shared/chat/types";

/** ノートのために取ってきた画像の覚え書き（中身はファイル。core/noteImageService.ts） */
export interface CachedNoteImage {
  project_id: number;
  path: string;
  key: string;
  host: string;
  content_type: string;
  size: number;
  fetched_at: string;
}

/** path がノート from か、フォルダ from の中か（SQL の条件と値。フォルダごと動かしたときに中のノートも付け替える） */
const under = (from: string) => ({ where: "(path = ? OR substr(path, 1, ?) = ?)", values: [from, from.length + 1, `${from}/`] as const });

/**
 * ノートの外の画像（note_image_hosts・note_image_cache の表）。許可したホストはノートごと（プロジェクトとノートのパス）。
 * 知らせ（SSE）は呼ぶ側（NoteImageService）が出す
 */
export function createNoteImageStore(db: DatabaseSync) {
  return {
    hosts(projectId: number, path: string): ChatImageHost[] {
      return db.prepare("SELECT host, allowed_at FROM note_image_hosts WHERE project_id = ? AND path = ? ORDER BY allowed_at, host").all(projectId, path) as unknown as ChatImageHost[];
    },
    allowed(projectId: number, path: string, host: string): boolean {
      return db.prepare("SELECT 1 FROM note_image_hosts WHERE project_id = ? AND path = ? AND host = ?").get(projectId, path, host) !== undefined;
    },
    allow(projectId: number, path: string, host: string): void {
      db.prepare("INSERT OR IGNORE INTO note_image_hosts (project_id, path, host) VALUES (?, ?, ?)").run(projectId, path, host);
    },
    /** 許可を外す（そのホストの覚え書きも消し、消した画像の key を返す。ファイルは呼ぶ側が消す） */
    revoke(projectId: number, path: string, host: string): string[] {
      db.prepare("DELETE FROM note_image_hosts WHERE project_id = ? AND path = ? AND host = ?").run(projectId, path, host);
      const keys = db.prepare("SELECT key FROM note_image_cache WHERE project_id = ? AND path = ? AND host = ?").all(projectId, path, host) as { key: string }[];
      db.prepare("DELETE FROM note_image_cache WHERE project_id = ? AND path = ? AND host = ?").run(projectId, path, host);
      return keys.map((k) => k.key);
    },
    /** ノート（かフォルダ）from の中の、許可か覚え書きのあるノートのパス */
    notesUnder(projectId: number, from: string): string[] {
      const { where, values } = under(from);
      const rows = db.prepare(`SELECT path FROM note_image_hosts WHERE project_id = ? AND ${where} UNION SELECT path FROM note_image_cache WHERE project_id = ? AND ${where}`).all(projectId, ...values, projectId, ...values) as { path: string }[];
      return rows.map((r) => r.path);
    },
    /** ノート 1 つの許可と覚え書きを、別の場所へ付け替える（行き先に同じホストの許可・同じ画像がもうあれば、そちらを残す） */
    move(fromProject: number, from: string, toProject: number, to: string): void {
      db.prepare("UPDATE OR REPLACE note_image_hosts SET project_id = ?, path = ? WHERE project_id = ? AND path = ?").run(toProject, to, fromProject, from);
      db.prepare("UPDATE OR REPLACE note_image_cache SET project_id = ?, path = ? WHERE project_id = ? AND path = ?").run(toProject, to, fromProject, from);
    },
    /** ノート（かフォルダ）の許可と覚え書きを消す（消したパスを返す。ファイルは呼ぶ側が消す） */
    forgetNote(projectId: number, path: string): string[] {
      const { where, values } = under(path);
      const paths = db.prepare(`SELECT DISTINCT path FROM note_image_cache WHERE project_id = ? AND ${where}`).all(projectId, ...values) as { path: string }[];
      db.prepare(`DELETE FROM note_image_hosts WHERE project_id = ? AND ${where}`).run(projectId, ...values);
      db.prepare(`DELETE FROM note_image_cache WHERE project_id = ? AND ${where}`).run(projectId, ...values);
      return paths.map((p) => p.path);
    },
    cached(projectId: number, path: string, key: string): CachedNoteImage | undefined {
      return db.prepare("SELECT * FROM note_image_cache WHERE project_id = ? AND path = ? AND key = ?").get(projectId, path, key) as unknown as CachedNoteImage | undefined;
    },
    remember(image: Omit<CachedNoteImage, "fetched_at">): void {
      db.prepare(
        "INSERT INTO note_image_cache (project_id, path, key, host, content_type, size) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (project_id, path, key) DO UPDATE SET host = excluded.host, content_type = excluded.content_type, size = excluded.size, fetched_at = excluded.fetched_at",
      ).run(image.project_id, image.path, image.key, image.host, image.content_type, image.size);
    },
    forget(projectId: number, path: string, key: string): void {
      db.prepare("DELETE FROM note_image_cache WHERE project_id = ? AND path = ? AND key = ?").run(projectId, path, key);
    },
    totalSize(): number {
      return (db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM note_image_cache").get() as { total: number }).total;
    },
    oldest(limit: number): CachedNoteImage[] {
      return db.prepare("SELECT * FROM note_image_cache ORDER BY fetched_at, project_id, path, key LIMIT ?").all(limit) as unknown as CachedNoteImage[];
    },
  };
}
