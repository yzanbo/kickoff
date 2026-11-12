// DB ワーカーを本物の別のプロセス（node ＋ tsx）で動かす: 起動・頼み・DB 側の読み取り専用・止める（SQLite はワーカーごと）・
// 何もしないと止まる（準備のコマンドを流している間は止めない）・止めるとワーカーが起動したシェルも止める
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { tempDir } from "../testing/tempDir.js";
import { DbWorkerClient, forkWorker, killGroup, type WorkerChannel } from "./client.js";
import { devWorkerEntry } from "./entry.js";
import type { DbTarget } from "./protocol.js";

function sqliteTarget(readOnly = false): DbTarget {
  const file = path.join(tempDir(), "t.db");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE t (a INTEGER); INSERT INTO t VALUES (1), (2), (3);");
  db.close();
  return { engine: "sqlite", host: null, port: null, database: null, username: null, password: null, file, ssl: null, read_only: readOnly };
}

test("DB ワーカー: 別のプロセスで起動して流し、DB 側の読み取り専用は書く文を断る", async (t) => {
  const client = new DbWorkerClient(() => forkWorker(devWorkerEntry()));
  t.after(() => client.stop());
  const target = sqliteTarget();
  const result = await client.request("query", { session: "s", target, sql: "select a from t order by a", max_rows: 2 });
  assert.deepEqual(result.rows, [[1], [2]]);
  assert.equal(result.truncated, true);
  assert.equal(client.running, true);

  const readOnly = { ...target, read_only: true };
  await assert.rejects(client.request("query", { session: "ro", target: readOnly, sql: "delete from t", max_rows: 10 }), /readonly/);
  // 同じ名前の接続でも、トランザクションの途中ならつなぎ方を変えない
  await client.request("query", { session: "tx", target, sql: "begin", max_rows: 1 });
  assert.equal(client.isInTransaction("tx"), true);
  await assert.rejects(client.request("query", { session: "tx", target: readOnly, sql: "select 1", max_rows: 1 }), /トランザクションの途中/);
  await client.request("rollback", { session: "tx" });
  assert.equal(client.isInTransaction("tx"), false);
});

test("DB ワーカー: SQLite の文を止めるとワーカーごと止め、次の頼みで起動し直す", async (t) => {
  const client = new DbWorkerClient(() => forkWorker(devWorkerEntry()));
  t.after(() => client.stop());
  const target = sqliteTarget();
  await client.request("query", { session: "s", target, sql: "select 1", max_rows: 1 });
  const controller = new AbortController();
  // 終わらない再帰の問い合わせ
  const slow = client.request(
    "query",
    { session: "s", target, sql: "with recursive c(x) as (select 1 union all select x + 1 from c) select count(*) from c", max_rows: 1 },
    { signal: controller.signal, engine: "sqlite" },
  );
  setTimeout(() => controller.abort(), 200);
  await assert.rejects(slow, /止めました/);
  assert.equal(client.running, false);
  const again = await client.request("query", { session: "s", target, sql: "select count(*) from t", max_rows: 1 });
  assert.deepEqual(again.rows, [[3]]);
});

test("DB ワーカー: 何もしない状態が続いたら止まる（トランザクションの途中なら止めない）。止めると途中の印も消える", async () => {
  let channel: WorkerChannel | null = null;
  const client = new DbWorkerClient(() => (channel = forkWorker(devWorkerEntry())), 300);
  const target = sqliteTarget();
  await client.request("query", { session: "s", target, sql: "select 1", max_rows: 1 });
  // 何もしないと止まる
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(client.running, false);

  // トランザクションの途中なら止めない
  await client.request("query", { session: "s", target, sql: "begin", max_rows: 1 });
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(client.running, true);
  client.stop();
  assert.equal(client.isInTransaction("s"), false);
  assert.ok(channel);

  // 準備のコマンドを流している間も止めない（終われば止まる）
  await client.request("prepare", { connection_id: 1, commands: ["sleep 1"], cleanup: [], vars: {}, my_ip_url: null });
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(client.running, true);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(client.running, false);
});

test("DB ワーカー: 止めると、ワーカーが起動したシェル（準備のコマンド）も止める", async () => {
  const killed: number[] = [];
  const client = new DbWorkerClient(
    () => forkWorker(devWorkerEntry()),
    60_000,
    (pid) => {
      killed.push(pid);
      killGroup(pid);
    },
  );
  const running = client.request("prepare", { connection_id: 1, commands: ["sleep 30"], cleanup: [], vars: {}, my_ip_url: null }).catch(() => null);
  await new Promise((r) => setTimeout(r, 800));
  client.stop();
  await running;
  assert.equal(killed.length, 1);
  await new Promise((r) => setTimeout(r, 200));
  // シェルのプロセスグループはもういない
  assert.throws(() => process.kill(-killed[0], 0));
});

test("DB ワーカー: 開いた接続の知らせを覚え、ワーカーが落ちたら開いていた接続をすべて閉じたと知らせる", () => {
  let listener: Parameters<WorkerChannel["onMessage"]>[0] = () => {};
  let exited: (reason: string) => void = () => {};
  const channel: WorkerChannel = { send: () => {}, onMessage: (fn) => (listener = fn), onExit: (fn) => (exited = fn), kill: () => {} };
  const client = new DbWorkerClient(() => channel);
  const seen: string[] = [];
  client.onEvent = (e) => e.event === "session" && seen.push(`${e.name}:${e.open}`);
  void client.request("close", { session: "z" }).catch(() => {});
  listener({ event: "session", name: "a", open: true });
  listener({ event: "session", name: "b", open: true });
  listener({ event: "session", name: "a", open: false });
  // 知らない接続を閉じた知らせは流さない
  listener({ event: "session", name: "x", open: false });
  exited("終了コード 1");
  assert.deepEqual(seen, ["a:true", "b:true", "a:false", "b:false"]);
});
