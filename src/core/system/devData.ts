import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_FILE } from "../db/open.js";

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
 * 写したあとは別々のデータになる。データベースは、本番のアプリが動いていても崩れないよう VACUUM INTO で写し、別の本体にする（becomeAnotherHost）
 */
export function seedDevData(prodDir: string, devDir: string): boolean {
  if (fs.existsSync(devDir) || !fs.existsSync(prodDir)) return false;
  fs.cpSync(prodDir, devDir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
  const prodDb = path.join(prodDir, DB_FILE);
  if (fs.existsSync(prodDb)) {
    const devDb = path.join(devDir, DB_FILE);
    const db = new DatabaseSync(prodDb, { readOnly: true });
    try {
      db.exec(`VACUUM INTO '${devDb.replaceAll("'", "''")}'`);
    } finally {
      db.close();
    }
    becomeAnotherHost(devDb);
  }
  return true;
}

/**
 * 写した DB を別の本体にする: 本体の ID（meta の database_id）を作り直し、端末の表を空にする
 * （そのままだと、スマホが製品版と開発版を同じ本体と見なし、製品版につないだ端末のトークンで開発版にも入れるため）。
 * 写したのが端末の表より前の版の DB なら、表は開いたときの migrate が空で作る
 */
function becomeAnotherHost(file: string): void {
  const db = new DatabaseSync(file);
  try {
    db.exec("UPDATE meta SET value = lower(hex(randomblob(16))) WHERE key = 'database_id'");
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'devices'").get()) db.exec("DELETE FROM devices");
  } finally {
    db.close();
  }
}
