import { DatabaseSync } from "node:sqlite";
import { backupBeforeMigration } from "./dbBackup.js";
import { convertLegacyDatabase } from "./legacyMigration.js";
import { inspectSchema, migrate, SCHEMA_VERSION, userVersion } from "./schema.js";

/**
 * Kickoff のデータベースを開き、いまの版にそろえる。何のデータベースかは、触る前に調べる（inspectSchema。違えば例外）。
 * いまあるデータの版を上げるとき・古い系統から変換するときは、その前に backups/ に写す（作ったばかり・メモリの DB は除く）
 */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    const state = inspectSchema(db);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    const upgrading = state.kind === "legacy" || (state.kind === "current" && state.version < SCHEMA_VERSION);
    // 写しの名前の版は PRAGMA user_version のまま（古い系統の v17 は kickoff-v17-…、いまの系統の v1 は kickoff-v101-…。重ならない）
    if (file !== ":memory:" && upgrading) backupBeforeMigration(db, file, userVersion(db));
    if (state.kind === "legacy") convertLegacyDatabase(db);
    migrate(db);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
