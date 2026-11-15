import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { DB_FILE, discardPrereleaseData, openDatabase, sqliteLabel } from "./open.js";
import { APPLICATION_ID, SCHEMA_VERSION, USER_VERSION_BASE, userVersion } from "./schema.js";
import { tempDir } from "../testing/tempDir.js";
import { afterTest } from "../testing/afterTest.js";
import { startStallWatch, type StallRecord } from "../system/stallWatch.js";

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

test("sqliteLabel: SQL の頭から動詞と表を読む（表が読めなければ動詞だけ）", () => {
  assert.equal(sqliteLabel("SELECT * FROM chat_events WHERE chat_id = ?"), "sqlite:select chat_events");
  assert.equal(sqliteLabel("\n  select c.id from \"chats\" c"), "sqlite:select chats");
  assert.equal(sqliteLabel("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"), "sqlite:insert settings");
  assert.equal(sqliteLabel("UPDATE OR IGNORE projects SET name = ?"), "sqlite:update projects");
  assert.equal(sqliteLabel("DELETE FROM queues WHERE id = ?"), "sqlite:delete queues");
  assert.equal(sqliteLabel("PRAGMA user_version"), "sqlite:pragma");
});

test("openDatabase: 詰まりの見張りのために包んだ prepare・exec は、結果を変えず、遅い文に名前を付ける", () => {
  // 時計は偽物にする（本物の時間は待たない）
  let now = 0;
  let tick = () => {};
  const records: StallRecord[] = [];
  const stop = startStallWatch({
    process: "main",
    onStall: (r) => records.push(r),
    clock: { now: () => now, every: (_ms, fn) => ((tick = fn), () => {}), cpuMs: () => now, gcMs: () => 0, rssMB: () => 0 },
  });
  afterTest(stop);
  const db = openDatabase(path.join(tempDir(), DB_FILE));
  afterTest(() => db.close());
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT) STRICT");
  const insert = db.prepare("INSERT INTO t (v) VALUES (?)");
  assert.equal(insert.run("a").changes, 1);
  insert.run("b");
  assert.deepEqual(db.prepare("SELECT v FROM t ORDER BY id").all().map((r) => r.v), ["a", "b"]);
  assert.deepEqual({ ...db.prepare("SELECT count(*) AS n FROM t").get() }, { n: 2 });
  assert.deepEqual([...db.prepare("SELECT id FROM t ORDER BY id").iterate()].map((r) => r.id), [1, 2]);
  tick();
  assert.equal(records.length, 0);
  // 遅い文のふりをする（SQL の関数の中で偽の時計を 600ms 進める）
  db.function("slow", () => {
    now += 600;
    return 1;
  });
  assert.deepEqual({ ...db.prepare("SELECT slow() AS s FROM t WHERE id = 1").get() }, { s: 1 });
  now += 200;
  tick();
  assert.equal(records.length, 1);
  assert.equal(records[0].task, "sqlite:select t");
  assert.equal(records[0].taskMs, 600);
});
