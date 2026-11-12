import assert from "node:assert/strict";
import { test } from "node:test";
import { findDbItems, openTreePaths, type DbFindSource } from "./dbFind";

const main = { database: "main", schema: null };
const source: DbFindSource = {
  connection_id: 1,
  path: main,
  objects: [
    { kind: "table", name: "posts", estimated_rows: 10 },
    { kind: "view", name: "user_names", estimated_rows: null },
    { kind: "table", name: "users", estimated_rows: 3 },
    { kind: "function", name: "user_count()" },
  ],
  columns: new Map([
    ["posts", ["id", "user_id", "title"]],
    ["users", ["id", "name"]],
    ["user_names", ["name"]],
  ]),
};
const labels = (q: string, limit?: number) => findDbItems([source], q, limit).map((i) => (i.column ? `${i.table}.${i.column}` : i.table));

test("findDbItems: 空ならテーブル・ビューを元の並びで（関数は出さない）", () => {
  assert.deepEqual(labels(""), ["posts", "user_names", "users"]);
});

test("findDbItems: 名前で当たったテーブルが先、列は後。同じ名前 → 頭 → 中の順", () => {
  assert.deepEqual(labels("users"), ["users"]);
  assert.deepEqual(labels("user"), ["user_names", "users", "posts.user_id"]);
  assert.deepEqual(labels("name"), ["user_names", "user_names.name", "users.name"]);
  assert.deepEqual(labels("ID"), ["posts.id", "users.id", "posts.user_id"]);
});

test("findDbItems: 「表.列」は両方で絞る。列が空ならその表の列すべて", () => {
  assert.deepEqual(labels("po.ti"), ["posts.title"]);
  assert.deepEqual(labels("users."), ["users.id", "users.name"]);
  assert.deepEqual(labels("nope.id"), []);
});

test("findDbItems: limit で切る・key は接続と場所ごとに別", () => {
  assert.deepEqual(labels("", 2), ["posts", "user_names"]);
  const other: DbFindSource = { ...source, connection_id: 2 };
  const keys = findDbItems([source, other], "posts").map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("openTreePaths: PostgreSQL はスキーマの段、ほかは DB の段。ほかの接続・テーブルの段は見ない", () => {
  const keys = ["c:1", "d:1:app", "s:1:app:public", "s:1:app:audit", "t:1:app:public:users", "d:2:shop", "s:12:x:y"];
  assert.deepEqual(openTreePaths(keys, 1, "postgres"), [
    { database: "app", schema: "public" },
    { database: "app", schema: "audit" },
  ]);
  assert.deepEqual(openTreePaths(keys, 2, "mysql"), [{ database: "shop", schema: null }]);
  assert.deepEqual(openTreePaths(keys, 3, "sqlite"), []);
});
