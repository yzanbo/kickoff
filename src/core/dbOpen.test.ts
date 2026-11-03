import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openDatabase } from "./dbOpen.js";
import { APPLICATION_ID, SCHEMA_VERSION, schemaVersion } from "./schema.js";

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-open-")), "kickoff.db");
const applicationId = (db: DatabaseSync) => (db.prepare("PRAGMA application_id").get() as { application_id: number }).application_id;

test("openDatabase: 空の DB には、いまの系統の印（'KICK'）を付けて最新の版を作る。開き直しても変えない", () => {
  const file = tempFile();
  const db = openDatabase(file);
  assert.equal(applicationId(db), APPLICATION_ID);
  assert.equal(schemaVersion(db), SCHEMA_VERSION);
  assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  db.exec("INSERT INTO run_event_search (run_event_search) VALUES ('integrity-check')");
  db.close();
  const again = openDatabase(file);
  assert.equal(schemaVersion(again), SCHEMA_VERSION);
  // VACUUM INTO で写したもの（版を上げる前の写し・開発版の種）も、印が残るので開ける
  const copy = path.join(path.dirname(file), "copy.db");
  again.exec(`VACUUM INTO '${copy}'`);
  again.close();
  const copied = openDatabase(copy);
  assert.equal(applicationId(copied), APPLICATION_ID);
  copied.close();
  assert.ok(!fs.existsSync(path.join(path.dirname(file), "backups")));
});

test("openDatabase: Kickoff のものでない・対応していない版の DB は、触らずに分かる文の例外を投げる", () => {
  const cases: [string, string][] = [
    ["ほかのアプリの DB（印なし・版 0・表あり）", "CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('x');"],
    ["古い系統の古い版", "CREATE TABLE projects (name TEXT); PRAGMA user_version = 12;"],
    ["ほかのアプリの印", "CREATE TABLE t (x); PRAGMA application_id = 1234; PRAGMA user_version = 1;"],
  ];
  for (const [name, sql] of cases) {
    const file = tempFile();
    const db = new DatabaseSync(file);
    db.exec(sql);
    db.close();
    const before = fs.readFileSync(file);
    assert.throws(() => openDatabase(file), /対応していない版のため開けません/, name);
    assert.ok(fs.readFileSync(file).equals(before), name);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["kickoff.db"], name);
  }
});
