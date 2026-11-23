import type { DatabaseSync } from "node:sqlite";
import type { DbErPositions } from "@shared/database/types";
import { NOW } from "@/foundation/core/db/db";
import { dbErLayoutsTable } from "@/features/database/core/schema";

/**
 * ER 図で動かしたテーブルの位置（db_er_layouts の表。接続と DB の場所 scope（DB・スキーマ）ごとに 1 行）。
 * 知らせは出さない（ER 図を開いたときに読む）。接続を消すと連鎖で消える
 */
export function createDbErLayoutStore(db: DatabaseSync) {
  const rows = dbErLayoutsTable.on(db);
  return {
    get: (connectionId: number, scope: string): DbErPositions => rows.one("connection_id = ? AND scope = ?", [connectionId, scope])?.positions ?? {},
    set(connectionId: number, scope: string, positions: DbErPositions): void {
      db.prepare(
        `INSERT INTO db_er_layouts (connection_id, scope, positions) VALUES (?, ?, ?) ON CONFLICT (connection_id, scope) DO UPDATE SET positions = excluded.positions, updated_at = ${NOW}`,
      ).run(connectionId, scope, JSON.stringify(positions));
    },
    delete(connectionId: number, scope: string): void {
      db.prepare("DELETE FROM db_er_layouts WHERE connection_id = ? AND scope = ?").run(connectionId, scope);
    },
  };
}
