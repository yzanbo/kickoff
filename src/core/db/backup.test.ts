import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { backupBeforeMigration } from "./backup.js";
import { SCHEMA_VERSION, USER_VERSION_BASE, userVersion } from "./schema.js";
import { Store } from "./store.js";
import { createLegacyV17 } from "../testing/legacySchemaV17.js";

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
  assert.equal(userVersion(db), USER_VERSION_BASE + SCHEMA_VERSION);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Store: 古い系統の DB を変換する前に写す（変換に失敗しても、写しは残り、元のまま）", () => {
  const dir = tempDir();
  const file = path.join(dir, "kickoff.db");
  const legacy = new DatabaseSync(file);
  createLegacyV17(legacy);
  // 新しいスキーマの決まり（費用は 0 以上）に合わない行があると、変換は失敗する
  legacy.exec("INSERT INTO projects (name, repo_path) VALUES ('p', '/tmp/p'); INSERT INTO runs (project_id, phase, provider, status, cost_usd) VALUES (1, 'testing', 'claude', 'completed', -1);");
  legacy.close();
  assert.throws(() => new Store(file));
  const backups = fs.readdirSync(path.join(dir, "backups"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^kickoff-v17-/);
  // 元の DB は v17 のまま（表も行もそのまま）
  const db = new DatabaseSync(file);
  assert.equal(userVersion(db), 17);
  assert.equal(db.prepare("SELECT count(*) AS n FROM runs").get()?.n, 1);
  assert.deepEqual(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name),
    ["artifacts", "projects", "run_events", "run_groups", "runs", "settings", "tasks"],
  );
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
