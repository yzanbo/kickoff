import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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
  "kickoff.db",
  "kickoff.db-wal",
  "kickoff.db-shm",
]);

/**
 * 開発の保存先がまだなければ、本番のデータ（プロジェクト・チャット・画面の設定など）を一度だけ写す。
 * 写したあとは別々のデータになる。データベースは、本番のアプリが動いていても崩れないよう VACUUM INTO で写す
 */
export function seedDevData(prodDir: string, devDir: string): boolean {
  if (fs.existsSync(devDir) || !fs.existsSync(prodDir)) return false;
  fs.cpSync(prodDir, devDir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
  const prodDb = path.join(prodDir, "kickoff.db");
  if (fs.existsSync(prodDb)) {
    const db = new DatabaseSync(prodDb, { readOnly: true });
    try {
      db.exec(`VACUUM INTO '${path.join(devDir, "kickoff.db").replaceAll("'", "''")}'`);
    } finally {
      db.close();
    }
  }
  return true;
}
