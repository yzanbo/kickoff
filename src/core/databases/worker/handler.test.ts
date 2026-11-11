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
