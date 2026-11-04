import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openDatabase } from "./open.js";
import { APPLICATION_ID, LEGACY_VERSION, SCHEMA_V1, SCHEMA_VERSION, USER_VERSION_BASE, userVersion } from "./schema.js";
import { PROJECT_HUES } from "@shared/project/colors";
import { Store } from "./store.js";
import { createLegacyV17 } from "../testing/legacySchemaV17.js";

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-open-")), "kickoff.db");
const applicationId = (db: DatabaseSync) => (db.prepare("PRAGMA application_id").get() as { application_id: number }).application_id;

test("openDatabase: 空の DB には、いまの系統の印（'KICK'）を付けて最新の版を作る。開き直しても変えない", () => {
  const file = tempFile();
  const db = openDatabase(file);
  assert.equal(applicationId(db), APPLICATION_ID);
  assert.equal(userVersion(db), USER_VERSION_BASE + SCHEMA_VERSION);
  assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  db.exec("INSERT INTO run_event_search (run_event_search) VALUES ('integrity-check')");
  db.close();
  const again = openDatabase(file);
  assert.equal(userVersion(again), USER_VERSION_BASE + SCHEMA_VERSION);
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
    ["ほかのアプリの印", "CREATE TABLE t (x); PRAGMA application_id = 1234; PRAGMA user_version = 101;"],
    ["いまの系統の印で、版が 101 より前", `CREATE TABLE t (x); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 1;`],
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

test("いまの系統の user_version は 100 ＋ 版なので、古いコードの migrate（17 未満のときだけ流す）は何もしない", () => {
  /** 古いコードの migrate と同じループで、流すことになる以前の MIGRATIONS の番号 */
  const legacyStepsFor = (db: DatabaseSync) => {
    const steps: number[] = [];
    for (let v = userVersion(db); v < LEGACY_VERSION; v++) steps.push(v);
    return steps;
  };
  const created = openDatabase(tempFile());
  assert.deepEqual(legacyStepsFor(created), []);
  created.close();
  // 古い系統の v17 から変換した DB も同じ
  const file = tempFile();
  const legacy = new DatabaseSync(file);
  createLegacyV17(legacy);
  legacy.close();
  const converted = new Store(file);
  assert.equal(userVersion(converted.db), USER_VERSION_BASE + SCHEMA_VERSION);
  assert.deepEqual(legacyStepsFor(converted.db), []);
  converted.close();
  // 写しの名前の版は user_version のまま（古い系統の v17）
  assert.match(fs.readdirSync(path.join(path.dirname(file), "backups"))[0], /^kickoff-v17-/);
});

test("openDatabase: いまの系統の v1 の DB は、写してから版を上げ、既存のプロジェクトのタグは空の配列になる", () => {
  const file = tempFile();
  const v1 = new DatabaseSync(file);
  v1.exec(SCHEMA_V1);
  v1.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + 1};`);
  v1.exec("INSERT INTO projects (name, repo_path, hue) VALUES ('p', '/tmp/p', 0)");
  v1.close();
  const store = new Store(file);
  assert.equal(userVersion(store.db), USER_VERSION_BASE + SCHEMA_VERSION);
  assert.deepEqual(store.listProjects()[0].tags, []);
  // タグの列も JSON かを確かめる
  assert.throws(() => store.db.exec("UPDATE projects SET tags = 'x'"), /CHECK constraint failed/);
  store.close();
  assert.match(fs.readdirSync(path.join(path.dirname(file), "backups"))[0], /^kickoff-v101-/);
});

test("openDatabase: 色を足す前（v3 まで）のグループには、開いたときにプロジェクトごとに並び順で被らない色を付ける", () => {
  const file = tempFile();
  const v1 = new DatabaseSync(file);
  v1.exec(SCHEMA_V1);
  v1.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + 1};`);
  v1.exec("INSERT INTO projects (id, name, repo_path, hue) VALUES (1, 'p', '/tmp/p', 0), (2, 'q', '/tmp/q', 28)");
  v1.exec("INSERT INTO run_groups (project_id, name, position) VALUES (1, 'a', 0), (1, 'b', 1), (1, 'c', 2), (2, 'x', 0)");
  v1.close();
  const store = new Store(file);
  const hues = store.listGroups(1).map((g) => g.hue);
  assert.equal(new Set(hues).size, 3);
  assert.ok(hues.every((h) => (PROJECT_HUES as readonly number[]).includes(h)));
  // 別のプロジェクトのグループとは別に数える（そのプロジェクトの最初のグループと同じ色から）
  assert.equal(store.listGroups(2)[0].hue, hues[0]);
  // 新しく作るグループも、同じプロジェクトのほかのグループと被らない
  assert.ok(!hues.includes(store.createGroup(1, "d").hue));
  assert.throws(() => store.db.exec("UPDATE run_groups SET hue = 400"), /CHECK constraint failed/);
  store.close();
});
