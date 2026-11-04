import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DB_FILE, discardPrereleaseData, openDatabase } from "./open.js";
import { APPLICATION_ID, SCHEMA_VERSION, USER_VERSION_BASE, userVersion } from "./schema.js";
import { tempDir } from "../testing/tempDir.js";

const applicationId = (db: DatabaseSync) => (db.prepare("PRAGMA application_id").get() as { application_id: number }).application_id;

/** sql を流しただけのデータベースを作る（Kickoff の印・版は sql の中で付ける） */
function rawDatabase(dir: string, sql: string): string {
  const file = path.join(dir, DB_FILE);
  const db = new DatabaseSync(file);
  db.exec(sql);
  db.close();
  return file;
}

test("openDatabase: 空の DB には、いまの系統の印（'KICK'）を付けて最新の版を作る。開き直しても変えない", () => {
  const file = path.join(tempDir(), DB_FILE);
  const db = openDatabase(file);
  assert.equal(applicationId(db), APPLICATION_ID);
  assert.equal(userVersion(db), USER_VERSION_BASE + SCHEMA_VERSION);
  assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  db.close();
  const again = openDatabase(file);
  assert.equal(userVersion(again), USER_VERSION_BASE + SCHEMA_VERSION);
  // VACUUM INTO で写したもの（開発版の種）も、印が残るので開ける
  const copy = path.join(path.dirname(file), "copy.db");
  again.exec(`VACUUM INTO '${copy}'`);
  again.close();
  const copied = openDatabase(copy);
  assert.equal(applicationId(copied), APPLICATION_ID);
  copied.close();
});

test("openDatabase: Kickoff のものでない・このアプリより新しい版の DB は、触らずに分かる文の例外を投げる", () => {
  const cases: [string, string][] = [
    ["ほかのアプリの DB（印なし・版 0・表あり）", "CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('x');"],
    ["印のない古い版", "CREATE TABLE projects (name TEXT); PRAGMA user_version = 17;"],
    ["ほかのアプリの印", "CREATE TABLE t (x); PRAGMA application_id = 1234; PRAGMA user_version = 201;"],
    ["いまの系統の印で、版が 101 より前", `CREATE TABLE t (x); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 1;`],
    ["このアプリより新しい版", `CREATE TABLE t (x); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + SCHEMA_VERSION + 1};`],
  ];
  for (const [name, sql] of cases) {
    const dir = tempDir();
    const file = rawDatabase(dir, sql);
    const before = fs.readFileSync(file);
    assert.throws(() => openDatabase(file), /対応していない版のため開けません/, name);
    assert.equal(discardPrereleaseData(dir), false, name);
    assert.ok(fs.readFileSync(file).equals(before), name);
    assert.deepEqual(fs.readdirSync(dir), [DB_FILE], name);
  }
});

test("discardPrereleaseData: リリース前の系統（101〜199）の DB は、backups・uploads と一緒に消し、ほかのファイルは残す", () => {
  const dir = tempDir();
  rawDatabase(dir, `CREATE TABLE chats (id INTEGER); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 104;`);
  fs.writeFileSync(path.join(dir, `${DB_FILE}-wal`), "");
  fs.writeFileSync(path.join(dir, `${DB_FILE}-shm`), "");
  for (const sub of ["backups", "uploads", "models"]) {
    fs.mkdirSync(path.join(dir, sub));
    fs.writeFileSync(path.join(dir, sub, "file"), "x");
  }
  fs.writeFileSync(path.join(dir, "token"), "secret");
  assert.throws(() => openDatabase(path.join(dir, DB_FILE)), /リリース前の版/);

  assert.equal(discardPrereleaseData(dir), true);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["models", "token"]);
  // 消したあとは、空の DB として新しく作る
  const db = openDatabase(path.join(dir, DB_FILE));
  assert.equal(userVersion(db), USER_VERSION_BASE + SCHEMA_VERSION);
  db.close();
  assert.equal(discardPrereleaseData(dir), false);
});

test("discardPrereleaseData: DB がなければ何もしない", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "uploads"));
  assert.equal(discardPrereleaseData(dir), false);
  assert.deepEqual(fs.readdirSync(dir), ["uploads"]);
});
