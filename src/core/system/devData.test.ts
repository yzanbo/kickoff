import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { seedDevData } from "./devData.js";
import { tempDir } from "../testing/tempDir.js";

test("seedDevData: 開発の保存先がなければ、本番のデータを一度だけ写す（起動中の印・キャッシュは写さない）", () => {
  const root = tempDir();
  const prod = path.join(root, "Kickoff");
  const dev = path.join(root, "Kickoff Dev");
  fs.mkdirSync(path.join(prod, "Local Storage"), { recursive: true });
  fs.writeFileSync(path.join(prod, "Local Storage", "leveldb"), "settings");
  fs.writeFileSync(path.join(prod, "token"), "x".repeat(32));
  fs.writeFileSync(path.join(prod, "SingletonLock"), "");
  fs.mkdirSync(path.join(prod, "Cache"));
  // 本番のアプリが開いたままの（WAL に書きかけがある）データベース
  const db = new DatabaseSync(path.join(prod, "kickoff.db"));
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE projects (name TEXT); INSERT INTO projects VALUES ('kickoff');");
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('database_id', 'prod-id');");
  db.exec("CREATE TABLE devices (id INTEGER PRIMARY KEY, name TEXT, token_hash TEXT); INSERT INTO devices (name, token_hash) VALUES ('Pixel', 'h');");

  assert.equal(seedDevData(prod, dev), true);
  assert.equal(fs.readFileSync(path.join(dev, "Local Storage", "leveldb"), "utf8"), "settings");
  assert.ok(fs.existsSync(path.join(dev, "token")));
  assert.ok(!fs.existsSync(path.join(dev, "SingletonLock")));
  assert.ok(!fs.existsSync(path.join(dev, "Cache")));
  assert.ok(!fs.existsSync(path.join(dev, "kickoff.db-wal")));
  const copy = new DatabaseSync(path.join(dev, "kickoff.db"));
  assert.deepEqual(copy.prepare("SELECT name FROM projects").all().map((r) => r.name), ["kickoff"]);
  // 写した先は別の本体: 本体の ID を作り直し、端末の表を空にする（本番の DB は変えない）
  const devId = (copy.prepare("SELECT value FROM meta WHERE key = 'database_id'").get() as { value: string }).value;
  assert.match(devId, /^[0-9a-f]{32}$/);
  assert.deepEqual(copy.prepare("SELECT * FROM devices").all(), []);
  assert.equal((db.prepare("SELECT value FROM meta WHERE key = 'database_id'").get() as { value: string }).value, "prod-id");
  assert.equal(db.prepare("SELECT * FROM devices").all().length, 1);
  copy.close();

  // 写したあとは別々のデータ（2 回目は何もしない）
  db.exec("INSERT INTO projects VALUES ('dandori')");
  assert.equal(seedDevData(prod, dev), false);
  db.close();
});

test("seedDevData: 本番のデータがなければ何もしない", () => {
  const root = tempDir();
  assert.equal(seedDevData(path.join(root, "Kickoff"), path.join(root, "Kickoff Dev")), false);
  assert.ok(!fs.existsSync(path.join(root, "Kickoff Dev")));
});

test("seedDevData: 端末の表より前の版の DB を写しても、本体の ID は作り直す（表は開いたときに空で作られる）", () => {
  const root = tempDir();
  const prod = path.join(root, "Kickoff");
  const dev = path.join(root, "Kickoff Dev");
  fs.mkdirSync(prod);
  const db = new DatabaseSync(path.join(prod, "kickoff.db"));
  db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('database_id', 'prod-id');");
  db.close();
  assert.equal(seedDevData(prod, dev), true);
  const copy = new DatabaseSync(path.join(dev, "kickoff.db"));
  assert.notEqual((copy.prepare("SELECT value FROM meta WHERE key = 'database_id'").get() as { value: string }).value, "prod-id");
  copy.close();
});
