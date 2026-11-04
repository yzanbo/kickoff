import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspectSchema, migrate } from "./schema.js";

/** 保存先の中のデータベースのファイル名 */
export const DB_FILE = "kickoff.db";

/**
 * Kickoff のデータベースを開き、いまの版にそろえる。何のデータベースかは、触る前に調べる（inspectSchema。違えば例外）。
 * リリース前の版のデータベースは開かない（先に discardPrereleaseData で消す）
 */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    if (inspectSchema(db).kind === "prerelease") throw new Error("リリース前の版のデータベースは開きません（discardPrereleaseData で消してから作り直します）");
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrate(db);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
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
