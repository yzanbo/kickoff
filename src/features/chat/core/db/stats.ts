import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { DatabaseStats } from "@shared/chat/databaseStats";

/** 記録の多いチャットとして出す数 */
const BUSIEST = 5;

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

function fileMB(file: string | null): number {
  if (!file) return 0;
  try {
    return mb(fs.statSync(file).size);
  } catch {
    return 0;
  }
}

/** DB（file はそのファイル。メモリの DB は null で、大きさは 0）の大きさと、チャット・記録の数 */
export function databaseStats(db: DatabaseSync, file: string | null): DatabaseStats {
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
  const busiestChats = db
    .prepare(
      `SELECT e.chat_id AS id, COUNT(*) AS events, c.title AS title, c.status AS status
       FROM chat_events e JOIN chats c ON c.id = e.chat_id
       GROUP BY e.chat_id ORDER BY events DESC, e.chat_id LIMIT ${BUSIEST}`,
    )
    .all()
    .map((r) => ({ id: Number(r.id), events: Number(r.events), title: String(r.title), status: String(r.status) }));
  return { dbMB: fileMB(file), walMB: fileMB(file && `${file}-wal`), chats: count("chats"), events: count("chat_events"), busiestChats };
}
