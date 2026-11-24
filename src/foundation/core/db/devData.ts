import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { APPLICATION_ID, DB_FILE, USER_VERSION_BASE } from "./db";

/** 写さないもの（起動中の印・作り直せるキャッシュ。データベースは下で別に写す） */
const SKIP = new Set([
  "SingletonLock",
  "SingletonSocket",
  "SingletonCookie",
  "DevToolsActivePort",
  "Cache",
  "Code Cache",
  "GPUCache",
  "GPUPersistentCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GraphiteDawnCache",
  DB_FILE,
  `${DB_FILE}-wal`,
  `${DB_FILE}-shm`,
]);

/**
 * 開発の保存先がまだなければ、本番のデータ（プロジェクト・チャット・画面の設定など）を一度だけ写す。
 * 写したあとは別々のデータになる。データベースは、本番のアプリが動いていても崩れないよう VACUUM INTO で写し、別の本体にする（becomeAnotherHost）。
 * 本番のデータベースがいまの系統（user_version が 300 ＋ 版）でなければ写さない（開けないため。開発版は空のデータベースから作る）
 */
export function seedDevData(prodDir: string, devDir: string): boolean {
  if (fs.existsSync(devDir) || !fs.existsSync(prodDir)) return false;
  fs.cpSync(prodDir, devDir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
  const prodDb = path.join(prodDir, DB_FILE);
  if (fs.existsSync(prodDb)) {
    const devDb = path.join(devDir, DB_FILE);
    const db = new DatabaseSync(prodDb, { readOnly: true });
    let copied = false;
    try {
      if (isCurrentLine(db)) {
        db.exec(`VACUUM INTO '${devDb.replaceAll("'", "''")}'`);
        copied = true;
      }
    } finally {
      db.close();
    }
    if (copied) becomeAnotherHost(devDb);
  }
  return true;
}

/** いまの系統の DB か（印が 'KICK' で user_version が 300 より大きい。版が新しすぎるかは開くときに調べる） */
function isCurrentLine(db: DatabaseSync): boolean {
  const pragma = (name: string) => Object.values(db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[0];
  return pragma("application_id") === APPLICATION_ID && pragma("user_version") > USER_VERSION_BASE;
}

/**
 * 写した DB を別の本体にする: 本体の ID（meta の database_id）を作り直し、端末の表と Kickoff が作ったセッションの覚えを空にする
 * （そのままだと、スマホが製品版と開発版を同じ本体と見なし、製品版につないだ端末のトークンで開発版にも入れるため）
 */
function becomeAnotherHost(file: string): void {
  const db = new DatabaseSync(file);
  try {
    db.exec("UPDATE meta SET value = lower(hex(randomblob(16))) WHERE key = 'database_id'");
    // Kickoff が作ったセッションの覚えも空にする（写した先が製品版のセッションを自分のものとして片付けないように）
    db.exec("DELETE FROM devices; DELETE FROM agent_sessions");
  } finally {
    db.close();
  }
}
