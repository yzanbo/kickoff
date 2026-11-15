import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspectSchema, migrate } from "./schema.js";
import { timed } from "../system/stallWatch.js";

/** 保存先の中のデータベースのファイル名 */
export const DB_FILE = "kickoff.db";

/**
 * Kickoff のデータベースを開き、いまの版にそろえる。何のデータベースかは、触る前に調べる（inspectSchema。違えば例外）。
 * リリース前の版のデータベースは開かない（先に discardPrereleaseData で消す）
 */
export const openDatabase = timed("boot:openDatabase", (file: string): DatabaseSync => {
  const db = new DatabaseSync(file);
  try {
    if (inspectSchema(db).kind === "prerelease") throw new Error("リリース前の版のデータベースは開きません（discardPrereleaseData で消してから作り直します）");
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

/**
 * リリース前の版（2026-11 の作り直しより前）の保存データを消す。新しい版はスキーマから作り直したので引き継がない（docs/architecture.md の「0. 決めたこと」）。
 * 消すのはデータベース（-wal・-shm も）と、それに付いていた backups/（版を上げる前の写し）・uploads/（チャットの添付）。
 * 音声入力のモデル・ログインのトークンなど、データベースに依らないものは残す。消したら true（見知らぬデータベースには触らない）
 */
export function discardPrereleaseData(dataDir: string): boolean {
  const file = path.join(dataDir, DB_FILE);
  if (!fs.existsSync(file)) return false;
  const db = new DatabaseSync(file);
  let prerelease = false;
  try {
    prerelease = inspectSchema(db).kind === "prerelease";
  } catch {
    // Kickoff のものでない・新しい版のデータベースは、ここでは触らない（開くときに分かる文の例外になる）
  } finally {
    db.close();
  }
  if (!prerelease) return false;
  for (const name of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, "backups", "uploads"]) {
    fs.rmSync(path.join(dataDir, name), { recursive: true, force: true });
  }
  return true;
}
