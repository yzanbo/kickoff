import { DatabaseSync } from "node:sqlite";
import { inspectSchema, migrate } from "./schema";
import { timed } from "@/foundation/core/system/stallWatch";

/** 保存先の中のデータベースのファイル名 */
export const DB_FILE = "kickoff.db";

/**
 * Kickoff のデータベースを開き、いまの版にそろえる。何のデータベースかは、触る前に調べる（inspectSchema。違えば例外）
 */
export const openDatabase = timed("boot:openDatabase", (file: string): DatabaseSync => {
  const db = new DatabaseSync(file);
  try {
    // WAL にするとファイルが変わるので、その前に調べる
    inspectSchema(db);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    timed("boot:migrate", migrate)(db);
    return timeStatements(db);
  } catch (e) {
    db.close();
    throw e;
  }
});

/**
 * 詰まりの見張り（system/stallWatch.ts）に SQL の名前を付ける: prepare を包み、文の run / get / all / iterate と exec を
 * 「sqlite:<select|insert|update|delete> <表>」の名前で測る（名前は遅かったときだけ作る）。店のコードは変えない
 */
function timeStatements(db: DatabaseSync): DatabaseSync {
  const prepare = db.prepare.bind(db);
  const exec = db.exec.bind(db);
  db.prepare = (sql, options) => {
    const label = () => sqliteLabel(sql);
    const stmt = timed(label, prepare)(sql, options);
    stmt.run = timed(label, stmt.run.bind(stmt)) as typeof stmt.run;
    stmt.get = timed(label, stmt.get.bind(stmt)) as typeof stmt.get;
    stmt.all = timed(label, stmt.all.bind(stmt)) as typeof stmt.all;
    // iterate は作るときだけ（読み進める分は呼んだ側の時間に入る）
    stmt.iterate = timed(label, stmt.iterate.bind(stmt)) as typeof stmt.iterate;
    return stmt;
  };
  db.exec = timed(sqliteLabel, exec);
  return db;
}

/** SQL の頭から、詰まりの記録に書く名前を作る（「sqlite:select chat_events」など。表が読めなければ動詞だけ） */
export function sqliteLabel(sql: string): string {
  const head = sql.trimStart();
  const verb = (/^\w+/.exec(head)?.[0] ?? "?").toLowerCase();
  const table =
    verb === "insert" || verb === "replace"
      ? /\bINTO\s+["`[]?(\w+)/i.exec(head)?.[1]
      : verb === "update"
        ? /^UPDATE\s+(?:OR\s+\w+\s+)?["`[]?(\w+)/i.exec(head)?.[1]
        : /\bFROM\s+["`[]?(\w+)/i.exec(head)?.[1];
  return table ? `sqlite:${verb} ${table}` : `sqlite:${verb}`;
}
