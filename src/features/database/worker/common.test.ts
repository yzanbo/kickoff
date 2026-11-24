// ドライバの共通の部分: 並べ替え・1 ページの文・結果の形と、流し方と読み方から組んだドライバの行・数・文
import assert from "node:assert/strict";
import { test } from "vitest";
import { driverOf, orderBy, pageSql, queryResult } from "./common";
import type { DbCatalog, DbConn, DbFetched } from "./conn";

test("orderBy: 並べ替えがなければ空、あれば囲んで DESC を付ける", () => {
  const quote = (n: string) => `"${n}"`;
  assert.equal(orderBy([], quote), "");
  assert.equal(orderBy([{ column: "a", desc: false }, { column: "b", desc: true }], quote), ' ORDER BY "a", "b" DESC');
});

test("pageSql: 絞り込みの値のあとに LIMIT と OFFSET の置き場所を足す", () => {
  assert.equal(pageSql('"t"', " WHERE x = $1", "", (n) => `$${n}`, 1), 'SELECT * FROM "t" WHERE x = $1 LIMIT $2 OFFSET $3');
  assert.equal(pageSql("`t`", "", " ORDER BY `a`", () => "?", 0), "SELECT * FROM `t` ORDER BY `a` LIMIT ? OFFSET ?");
});

test("queryResult: limit を超えた 1 行は続きの印にし、値はセルの形にする", () => {
  const fetched: DbFetched = { columns: [{ name: "n", type: null }], rows: [[1n], [2n], [3n]], more: false, affected: null };
  const page = queryResult(fetched, { limit: 2, started: performance.now(), inTransaction: true });
  assert.deepEqual(page.rows, [[1], [2]]);
  assert.equal(page.truncated, true);
  assert.equal(page.in_transaction, true);
  const all = queryResult({ ...fetched, more: true }, { started: performance.now(), inTransaction: false });
  assert.equal(all.rows.length, 3);
  assert.equal(all.truncated, true);
  const long = queryResult({ columns: [], rows: [["x".repeat(20_000)]], more: false, affected: null }, { started: 0, inTransaction: false, full: true });
  assert.equal(long.rows[0]![0], "x".repeat(20_000));
});

/** 流した文を覚える偽の接続 */
function fakeConn(answer: (sql: string) => DbFetched) {
  const ran: { sql: string; params: unknown[]; opts?: { max?: number; skip?: number } }[] = [];
  const conn = {
    fetch: async (sql: string, params: unknown[], opts?: { max?: number; skip?: number }) => (ran.push({ sql, params, opts }), answer(sql)),
    inTransaction: () => false,
  } as unknown as DbConn;
  return { conn, ran };
}

const catalog = { tableRef: async (_c: DbConn, path: { schema: string | null }, name: string) => `"${path.schema}"."${name}"` } as unknown as DbCatalog;

test("driverOf: 行は 1 行多く読み、絞り込みの値・LIMIT・OFFSET を params で渡す", async () => {
  const { conn, ran } = fakeConn(() => ({ columns: [{ name: "id", type: "int4" }], rows: [[1], [2], [3]], more: false, affected: null }));
  const driver = driverOf("postgres", conn, catalog);
  const result = await driver.rows({ database: null, schema: "public" }, "t", [{ column: "id", desc: true }], 10, 2, { filters: [{ column: "id", op: "gt", value: "5" }], where: null });
  assert.equal(ran[0]!.sql, 'SELECT * FROM "public"."t" WHERE "id" > $1 ORDER BY "id" DESC LIMIT $2 OFFSET $3');
  assert.deepEqual(ran[0]!.params, ["5", 3, 10]);
  assert.deepEqual(result.rows, [[1], [2]]);
  assert.equal(result.truncated, true);
});

test("driverOf: 数は COUNT の 1 つ目の値・文は max と skip を流し方に渡す", async () => {
  const { conn, ran } = fakeConn((sql) => (sql.startsWith("SELECT COUNT") ? { columns: [], rows: [[12n]], more: false, affected: null } : { columns: [], rows: [], more: false, affected: 4 }));
  const driver = driverOf("sqlite", conn, catalog);
  assert.equal(await driver.count({ database: null, schema: null }, "t", { filters: [], where: null }), 12);
  const result = await driver.query("UPDATE t SET a = 1", 100, 5);
  assert.deepEqual(ran[1]!.opts, { max: 100, skip: 5 });
  assert.equal(result.affected, 4);
});
