import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { backupBeforeMigration } from "./dbBackup.js";
import { SCHEMA_VERSION } from "./schema.js";
import { Store } from "./store.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-backup-"));
}

test("backupBeforeMigration: いまのデータベースを backups/ に写し、新しいものから 5 件だけ残す", () => {
  const dir = tempDir();
  const file = path.join(dir, "kickoff.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE projects (name TEXT); INSERT INTO projects VALUES ('kickoff');");

  const first = backupBeforeMigration(db, file, 16, new Date(2026, 10, 2, 9, 5, 7));
  assert.equal(path.basename(first), "kickoff-v16-20261102-090507.db");
  const copy = new DatabaseSync(first);
  assert.deepEqual(copy.prepare("SELECT name FROM projects").all().map((r) => r.name), ["kickoff"]);
  copy.close();

  for (let i = 1; i <= 6; i++) backupBeforeMigration(db, file, 16, new Date(2026, 10, 2, 10, i, 0));
  const left = fs.readdirSync(path.join(dir, "backups")).sort();
  assert.equal(left.length, 5);
  assert.equal(left[0], "kickoff-v16-20261102-100200.db");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Store: 新しく作るデータベース・いまの版のデータベースでは、バックアップを作らない", () => {
  const dir = tempDir();
  const file = path.join(dir, "kickoff.db");
  new Store(file).close();
  new Store(file).close();
  assert.ok(!fs.existsSync(path.join(dir, "backups")));
  const db = new DatabaseSync(file);
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SCHEMA_VERSION);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Store: 版を上げる前に写す（マイグレーションに失敗しても、写しは残る）", () => {
  const dir = tempDir();
  const file = path.join(dir, "kickoff.db");
  new Store(file).close();
  // 1 つ前の版に見せかける（最後のマイグレーションをもう一度当てることになり、すでにある列を足そうとして失敗する）
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION - 1}`);
  db.close();
  assert.throws(() => new Store(file));
  const backups = fs.readdirSync(path.join(dir, "backups"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], new RegExp(`^kickoff-v${SCHEMA_VERSION - 1}-`));
  fs.rmSync(dir, { recursive: true, force: true });
});
