import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { tx } from "./tx";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (v TEXT NOT NULL) STRICT");
  const values = () => (db.prepare("SELECT v FROM t ORDER BY rowid").all() as { v: string }[]).map((r) => r.v);
  const add = (v: string) => db.prepare("INSERT INTO t (v) VALUES (?)").run(v);
  return { db, values, add };
}

test("tx: 返した値を返して COMMIT し、例外なら ROLLBACK して投げ直す", () => {
  const { db, values, add } = setup();
  assert.equal(tx(db, () => (add("a"), 1)), 1);
  assert.throws(() => tx(db, () => { add("b"); throw new Error("だめ"); }), /だめ/);
  assert.deepEqual(values(), ["a"]);
  assert.equal(db.isTransaction, false);
});

test("tx: 入れ子は SAVEPOINT で、内側の失敗は内側だけを戻す。外側の失敗は全部を戻す", () => {
  const { db, values, add } = setup();
  tx(db, () => {
    add("a");
    assert.throws(() => tx(db, () => { add("b"); throw new Error("内側"); }));
    tx(db, () => add("c"));
  });
  assert.deepEqual(values(), ["a", "c"]);
  assert.throws(() => tx(db, () => { tx(db, () => add("d")); throw new Error("外側"); }));
  assert.deepEqual(values(), ["a", "c"]);
});

test("tx: immediate は書き込みの鍵を先に取る（ほかの接続の書き込みを待たせる）", () => {
  const file = path.join(tempDir(), "tx.db");
  const a = new DatabaseSync(file);
  const b = new DatabaseSync(file);
  a.exec("CREATE TABLE t (v TEXT) STRICT");
  tx(a, () => {
    assert.throws(() => b.exec("INSERT INTO t (v) VALUES ('x')"), /locked/);
  }, "immediate");
  b.exec("INSERT INTO t (v) VALUES ('y')");
  a.close();
  b.close();
});

test("tx: 待つ処理を渡したら戻して断る", () => {
  const { db, values, add } = setup();
  assert.throws(() => tx(db, async () => add("a")), /同期/);
  assert.deepEqual(values(), []);
});
