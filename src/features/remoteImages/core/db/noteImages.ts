import type { DatabaseSync } from "node:sqlite";
import { pathOrInside } from "@/foundation/core/db/common";
import { tx } from "@/foundation/core/db/tx";
import { createImageTables } from "./imageTables";

/**
 * ノートの外の画像（note_image_scopes・note_image_hosts・note_image_cache の表）。許可と覚え書きはノートの範囲（scope）の行にぶら下げる。
 * 知らせ（SSE）は呼ぶ側（NoteImageService）が出す
 */
export function createNoteImageStore(db: DatabaseSync) {
  const scope = (projectId: number, path: string): number | null =>
    (db.prepare("SELECT id FROM note_image_scopes WHERE project_id = ? AND path = ?").get(projectId, path) as { id: number } | undefined)?.id ?? null;
  return {
    ...createImageTables(db, { hosts: "note_image_hosts", cache: "note_image_cache", scope: "scope_id" }),
    /** ノートの範囲の ID（なければ null） */
    scope,
    /** ノートの範囲の ID（なければ作る。許可するときだけ作り、見るだけ・画像を頼むだけでは作らない） */
    ensureScope(projectId: number, path: string): number {
      return scope(projectId, path) ?? Number(db.prepare("INSERT INTO note_image_scopes (project_id, path) VALUES (?, ?)").run(projectId, path).lastInsertRowid);
    },
    /**
     * ノート（かフォルダ）from を動かした: 中のノートの範囲の path を書き換える（許可も覚えた画像も付いていく）。行き先に古い範囲が残っていれば先に消す。
     * 動かした範囲（ID と元・新しいパス）と、消した古い範囲の ID を返す（古い範囲のファイルは呼ぶ側が消す）。途中で失敗したら何も変えない
     */
    move(fromProject: number, from: string, toProject: number, to: string): { moved: { id: number; from: string; path: string }[]; dropped: number[] } {
      return tx(db, () => {
        const inside = pathOrInside("path", from);
        const rows = db.prepare(`SELECT id, path FROM note_image_scopes WHERE project_id = ? AND ${inside.sql}`).all(fromProject, ...inside.values) as { id: number; path: string }[];
        const moved = rows.map((r) => ({ id: r.id, from: r.path, path: to + r.path.slice(from.length) }));
        const dropped: number[] = [];
        for (const m of moved) {
          const stale = scope(toProject, m.path);
          if (stale !== null && stale !== m.id) {
            db.prepare("DELETE FROM note_image_scopes WHERE id = ?").run(stale);
            dropped.push(stale);
          }
          db.prepare("UPDATE note_image_scopes SET project_id = ?, path = ? WHERE id = ?").run(toProject, m.path, m.id);
        }
        return { moved, dropped };
      });
    },
    /** ノート（かフォルダ）の範囲を消す（許可と覚え書きも一緒に。消した範囲の ID とパスを返す。ファイルは呼ぶ側が消す） */
    forgetUnder(projectId: number, path: string): { id: number; path: string }[] {
      const inside = pathOrInside("path", path);
      return db.prepare(`DELETE FROM note_image_scopes WHERE project_id = ? AND ${inside.sql} RETURNING id, path`).all(projectId, ...inside.values) as { id: number; path: string }[];
    },
    /** いまある範囲の ID（ファイルだけ残った範囲を片付けるため） */
    scopeIds(): Set<number> {
      return new Set((db.prepare("SELECT id FROM note_image_scopes").all() as { id: number }[]).map((r) => r.id));
    },
  };
}
