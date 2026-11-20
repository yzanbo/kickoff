import type { DatabaseSync } from "node:sqlite";
import type { DbErPositions } from "@shared/database/types";
import { NOW } from "@/foundation/core/db/db";

/**
 * ER 図で動かしたテーブルの位置（db_er_layouts の表。接続と DB の場所 scope（DB・スキーマ。API では place）ごとに 1 行）。
 * 知らせは出さない（ER 図を開いたときに読む）。接続を消すと連鎖で消える
 */
export function createDbErLayoutStore(db: DatabaseSync) {
  return {
    get(connectionId: number, scope: string): DbErPositions {
      const row = db.prepare("SELECT positions FROM db_er_layouts WHERE connection_id = ? AND scope = ?").get(connectionId, scope) as { positions: string } | undefined;
      return row ? (JSON.parse(row.positions) as DbErPositions) : {};
    },
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
