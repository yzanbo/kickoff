// DB ワーカーの中身（同じプロセスで handle を呼ぶ）: 同じ名前の接続への頼みは 1 つずつ流す
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { tempDir } from "../../testing/tempDir.js";
import type { DbTarget, WorkerRequest } from "../protocol.js";
import { createWorkerHandler } from "./handler.js";

function sqliteTarget(): DbTarget {
  const file = path.join(tempDir(), "t.db");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE t (a INTEGER); INSERT INTO t VALUES (1);");
  db.close();
  return { engine: "sqlite", host: null, port: null, database: null, username: null, password: null, file, ssl: null, read_only: false };
}

test("DB ワーカー: まだない接続に同時に頼んでも 1 本だけ開き、同じ接続で順に流す", async (t) => {
  const handler = createWorkerHandler();
  t.after(() => handler.closeAll());
  const target = sqliteTarget();
  let id = 0;
  const query = (sql: string) => handler.handle({ id: ++id, method: "query", params: { session: "s", target, sql, max_rows: 10 } } as WorkerRequest);
  // 前は 2 つとも接続がないと見てそれぞれ開き、BEGIN した 1 本目は覚えから外れて閉じられずに残った
  const [begin, select] = await Promise.all([query("begin"), query("select a from t")]);
  assert.ok(begin.ok && select.ok);
  const after = await query("select 1");
  assert.ok(after.ok);
  assert.equal((after.result as { in_transaction: boolean }).in_transaction, true);
});

test("DB ワーカー: 10 分使わなかった接続は閉じ、トランザクションの途中の接続は残す。使えば数え直す", async (t) => {
  let clock = 0;
  const handler = createWorkerHandler(undefined, { sessionIdleMs: 1000, now: () => clock });
  t.after(() => handler.closeAll());
  const target = sqliteTarget();
  let id = 0;
  const query = (session: string, sql: string) => handler.handle({ id: ++id, method: "query", params: { session, target, sql, max_rows: 10 } } as WorkerRequest);
  assert.ok((await query("idle", "select 1")).ok);
  assert.ok((await query("tx", "begin")).ok);
  clock = 500;
  assert.ok((await query("used", "select 1")).ok);
  assert.deepEqual(await handler.closeIdle(), []);
  clock = 1200;
  // 使っていない接続だけ閉じる（トランザクションの途中の tx・500 に使った used は残す）
  assert.deepEqual(await handler.closeIdle(), ["idle"]);
  clock = 1600;
  assert.deepEqual(await handler.closeIdle(), ["used"]);
  // tx はまだトランザクションの途中なので残り、コミットのあとに閉じる
  const tx = await query("tx", "select a from t");
  assert.ok(tx.ok && (tx.result as { in_transaction: boolean }).in_transaction);
  assert.ok((await handler.handle({ id: ++id, method: "commit", params: { session: "tx" } } as WorkerRequest)).ok);
  clock = 3000;
  assert.deepEqual(await handler.closeIdle(), ["tx"]);
  // 閉じた名前で頼むと開き直す
  assert.ok((await query("idle", "select 1")).ok);
});

test("DB ワーカー: 何もしないで閉じたとき、その接続の接続がすべて閉じたら準備の後片付けを流す", async (t) => {
  let clock = 0;
  const runs: string[] = [];
  const handler = createWorkerHandler((e) => e.event === "prep_run" && runs.push(`${e.connection_id}:${e.kind}`), { sessionIdleMs: 1000, now: () => clock });
  t.after(() => handler.closeAll());
  const target = sqliteTarget();
  let id = 0;
  const call = (method: string, params: unknown) => handler.handle({ id: ++id, method, params } as WorkerRequest);
  assert.ok((await call("prepare", { connection_id: 7, commands: [], cleanup: ["true"], vars: {}, my_ip_url: null })).ok);
  // 準備が済むのを待つ
  for (let i = 0; i < 100; i++) {
    const s = await call("prepState", { connection_id: 7 });
    if (s.ok && !(s.result as { running: boolean }).running) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const query = (session: string) => call("query", { session, target, sql: "select 1", max_rows: 10 });
  assert.ok((await query("shared:7:-:-")).ok);
  assert.ok((await query("sql:7:tab")).ok);
  assert.ok((await query("shared:8:-:-")).ok);
  clock = 500;
  assert.ok((await query("sql:7:tab")).ok);
  clock = 1200;
  // 7 の SQL のタブがまだ開いているので流さない
  assert.deepEqual(await handler.closeIdle(), ["shared:7:-:-", "shared:8:-:-"]);
  assert.deepEqual(runs, []);
  clock = 1600;
  assert.deepEqual(await handler.closeIdle(), ["sql:7:tab"]);
  assert.deepEqual(runs, ["7:cleanup"]);
});
