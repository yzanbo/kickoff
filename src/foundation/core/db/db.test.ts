import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { APPLICATION_ID, DB_FILE, USER_VERSION_BASE, openDb, sqliteLabel, type Migration } from "./db";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { startStallWatch, type StallRecord } from "@/foundation/core/system/stallWatch";

const pragma = (db: DatabaseSync, name: "application_id" | "user_version") => (db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name];

/** 版の流し方だけを確かめる小さな版（機能の表は @/app/core/migrations.ts が並べる） */
const V1: Migration = { version: 1, sql: "CREATE TABLE a (x INTEGER NOT NULL) STRICT;" };
const V2: Migration = { version: 2, sql: "CREATE TABLE b (y TEXT NOT NULL) STRICT;" };

/** sql を流しただけのデータベースを作る（Kickoff の印・版は sql の中で付ける） */
function rawDatabase(dir: string, sql: string): string {
  const file = path.join(dir, DB_FILE);
  const db = new DatabaseSync(file);
  db.exec(sql);
  db.close();
  return file;
}

test("openDb: 空の DB には、いまの系統の印（'KICK'）を付けて最新の版（301 から）を作る。開き直しても変えない", () => {
  const file = path.join(tempDir(), DB_FILE);
  const db = openDb(file, [V1]);
  assert.equal(pragma(db, "application_id"), APPLICATION_ID);
  assert.equal(pragma(db, "user_version"), 301);
  assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  db.close();
  const again = openDb(file, [V1]);
  assert.equal(pragma(again, "user_version"), 301);
  // VACUUM INTO で写したもの（開発版の種）も、印が残るので開ける
  const copy = path.join(path.dirname(file), "copy.db");
  again.exec(`VACUUM INTO '${copy}'`);
  again.close();
  const copied = openDb(copy, [V1]);
  assert.equal(pragma(copied, "application_id"), APPLICATION_ID);
  copied.close();
});

test("openDb: いまの版より新しい版だけを順に流す。流せなかった版は戻して投げ、次に開くとまたそこから流す", () => {
  const file = path.join(tempDir(), DB_FILE);
  openDb(file, [V1]).close();
  const db = openDb(file, [V1, V2]);
  assert.equal(pragma(db, "user_version"), USER_VERSION_BASE + 2);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name), ["a", "b"]);
  db.close();
  const broken: Migration = { version: 3, sql: "CREATE TABLE c (z TEXT) STRICT; CREATE TABLE c (z TEXT) STRICT;" };
  assert.throws(() => openDb(file, [V1, V2, broken]), /already exists/);
  const after = openDb(file, [V1, V2]);
  assert.equal(pragma(after, "user_version"), USER_VERSION_BASE + 2);
  assert.equal(after.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'c'").get()?.n, 0);
  after.close();
});

test("openDb: Kickoff のものでない・このアプリより新しい版の DB は、触らずに分かる文の例外を投げる", () => {
  const cases: [string, string][] = [
    ["ほかのアプリの DB（印なし・版 0・表あり）", "CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('x');"],
    ["印のない古い版", "CREATE TABLE projects (name TEXT); PRAGMA user_version = 17;"],
    ["ほかのアプリの印", "CREATE TABLE t (x); PRAGMA application_id = 1234; PRAGMA user_version = 201;"],
    ["いまの系統の印で、版が 101 より前", `CREATE TABLE t (x); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 1;`],
    ["このアプリより新しい版", `CREATE TABLE t (x); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + 2};`],
    ["いまの系統の印で、リリース前の版（104）", `CREATE TABLE chats (id INTEGER); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 104;`],
    ["前の系統の最初の版（201）", `CREATE TABLE chats (id INTEGER); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 201;`],
    ["前の系統の最後の版（238）", `CREATE TABLE chats (id INTEGER); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 238;`],
  ];
  for (const [name, sql] of cases) {
    const dir = tempDir();
    const file = rawDatabase(dir, sql);
    const before = fs.readFileSync(file);
    assert.throws(() => openDb(file, [V1]), /対応していない版のため開けません/, name);
    assert.ok(fs.readFileSync(file).equals(before), name);
    assert.deepEqual(fs.readdirSync(dir), [DB_FILE], name);
  }
});

test("sqliteLabel: SQL の頭から動詞と表を読む（表が読めなければ動詞だけ）", () => {
  assert.equal(sqliteLabel("SELECT * FROM chat_events WHERE chat_id = ?"), "sqlite:select chat_events");
  assert.equal(sqliteLabel("\n  select c.id from \"chats\" c"), "sqlite:select chats");
  assert.equal(sqliteLabel("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"), "sqlite:insert settings");
  assert.equal(sqliteLabel("UPDATE OR IGNORE projects SET name = ?"), "sqlite:update projects");
  assert.equal(sqliteLabel("DELETE FROM queues WHERE id = ?"), "sqlite:delete queues");
  assert.equal(sqliteLabel("PRAGMA user_version"), "sqlite:pragma");
});

test("openDb: 詰まりの見張りのために包んだ prepare・exec は、結果を変えず、遅い文に名前を付ける", () => {
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
  const db = openDb(path.join(tempDir(), DB_FILE), []);
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
