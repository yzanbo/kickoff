import { DatabaseSync } from "node:sqlite";
import { backupBeforeMigration } from "./dbBackup.js";
import { inspectSchema, LEGACY_VERSION, migrate, SCHEMA_VERSION } from "./schema.js";

/**
 * Kickoff のデータベースを開き、いまの版にそろえる。何のデータベースかは、触る前に調べる（inspectSchema。違えば例外）。
 * いまあるデータの版を上げるとき・古い系統から変換するときは、その前に backups/ に写す（作ったばかり・メモリの DB は除く）
 */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    const state = inspectSchema(db);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    const from = state.kind === "current" ? state.version : state.kind === "legacy" ? LEGACY_VERSION : 0;
    const upgrading = state.kind === "legacy" || (from > 0 && from < SCHEMA_VERSION);
    if (file !== ":memory:" && upgrading) backupBeforeMigration(db, file, from);
    if (state.kind === "legacy") throw new Error("古い系統のデータベースの変換は、まだできません");
    migrate(db);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
