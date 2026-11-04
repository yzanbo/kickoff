import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

/** 記録の多いチャットとして出す数 */
const BUSIEST = 5;

/** 性能の記録（メインプロセスの診断）に載せる DB の様子 */
export interface DatabaseStats {
  /** DB と WAL のファイルの大きさ（MB。ないときは 0） */
  dbMB: number;
  walMB: number;
  chats: number;
  events: number;
  /** 記録の多いチャット（多い順。長く続けたチャットほど、開く・描くのが重くなる） */
  busiestChats: { id: number; events: number; title: string; status: string }[];
}

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

function fileMB(file: string): number {
  try {
    return mb(fs.statSync(file).size);
  } catch {
    return 0;
  }
}

/** DB（file はそのファイル。メモリの DB なら大きさは 0）の大きさと、チャット・記録の数 */
export function databaseStats(db: DatabaseSync, file: string): DatabaseStats {
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
  const busiestChats = db
    .prepare(
      `SELECT e.chat_id AS id, COUNT(*) AS events, c.title AS title, c.status AS status
       FROM chat_events e JOIN chats c ON c.id = e.chat_id
       GROUP BY e.chat_id ORDER BY events DESC, e.chat_id LIMIT ${BUSIEST}`,
    )
    .all()
    .map((r) => ({ id: Number(r.id), events: Number(r.events), title: String(r.title), status: String(r.status) }));
  return { dbMB: fileMB(file), walMB: fileMB(`${file}-wal`), chats: count("chats"), events: count("chat_events"), busiestChats };
}
