import type { DatabaseSync } from "node:sqlite";
import type { DbErPositions } from "@shared/types";
import { NOW } from "./schema.js";

/**
 * ER 図で動かしたテーブルの位置（db_er_layouts の表。接続と場所（DB・スキーマ）ごとに 1 行）。
 * 知らせは出さない（ER 図を開いたときに読む）。接続を消すと連鎖で消える
 */
export function createDbErLayoutStore(db: DatabaseSync) {
  return {
    get(connectionId: number, place: string): DbErPositions {
      const row = db.prepare("SELECT positions FROM db_er_layouts WHERE connection_id = ? AND place = ?").get(connectionId, place) as { positions: string } | undefined;
      return row ? (JSON.parse(row.positions) as DbErPositions) : {};
    },
    set(connectionId: number, place: string, positions: DbErPositions): void {
      db.prepare(
        `INSERT INTO db_er_layouts (connection_id, place, positions) VALUES (?, ?, ?) ON CONFLICT (connection_id, place) DO UPDATE SET positions = excluded.positions, updated_at = ${NOW}`,
      ).run(connectionId, place, JSON.stringify(positions));
    },
    delete(connectionId: number, place: string): void {
      db.prepare("DELETE FROM db_er_layouts WHERE connection_id = ? AND place = ?").run(connectionId, place);
    },
  };
}
