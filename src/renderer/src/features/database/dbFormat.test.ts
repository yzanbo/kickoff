import assert from "node:assert/strict";
import { test } from "node:test";
import { cellKind, cellText, connectionPlace, nextSort, objectPathLabel } from "./dbFormat";

test("cellText / cellKind: NULL・バイナリの札・数・文字", () => {
  assert.equal(cellText(null), "NULL");
  assert.equal(cellText({ binary: true, bytes: 12 * 1024, head: "00" }), "バイナリ 12.0 KB");
  assert.equal(cellText(true), "true");
  assert.equal(cellText(3), "3");
  assert.equal(cellKind(null), "null");
  assert.equal(cellKind({ binary: true, bytes: 1, head: "" }), "binary");
  assert.equal(cellText({ long: true, head: "ab", chars: 20_000 }), "ab…");
  assert.equal(cellKind({ long: true, head: "ab", chars: 20_000 }), "text");
  assert.equal(cellKind(1.5), "number");
  assert.equal(cellKind("a"), "text");
});

test("connectionPlace: SQLite はファイル、ほかはユーザー@ホスト:ポート/DB（ないものは省く）", () => {
  const base = { host: null, port: null, database: null, username: null, file_path: null };
  assert.equal(connectionPlace({ ...base, engine: "sqlite", file_path: "db/dev.sqlite3" }), "db/dev.sqlite3");
  assert.equal(connectionPlace({ ...base, engine: "postgres", host: "h", port: 5432, database: "app", username: "u" }), "u@h:5432/app");
  assert.equal(connectionPlace({ ...base, engine: "mysql", host: "h" }), "h");
});

test("nextSort: 昇順 → 降順 → なし、ほかの列は昇順から", () => {
  assert.deepEqual(nextSort([], "a"), [{ column: "a", desc: false }]);
  assert.deepEqual(nextSort([{ column: "a", desc: false }], "a"), [{ column: "a", desc: true }]);
  assert.deepEqual(nextSort([{ column: "a", desc: true }], "a"), []);
  assert.deepEqual(nextSort([{ column: "a", desc: true }], "b"), [{ column: "b", desc: false }]);
});

test("nextSort: ⇧ で足す（入っていない列は後ろに昇順、入っている列は 昇順 → 降順 → 外す）", () => {
  const a = { column: "a", desc: false };
  assert.deepEqual(nextSort([a], "b", true), [a, { column: "b", desc: false }]);
  assert.deepEqual(nextSort([a, { column: "b", desc: false }], "b", true), [a, { column: "b", desc: true }]);
  assert.deepEqual(nextSort([a, { column: "b", desc: true }], "b", true), [a]);
  assert.deepEqual(nextSort([], "a", true), [a]);
  // ⇧ なしで押すと、その列だけに戻す
  assert.deepEqual(nextSort([a, { column: "b", desc: true }], "b"), [{ column: "b", desc: false }]);
});

test("objectPathLabel: あるものだけを . でつなぐ", () => {
  assert.equal(objectPathLabel({ database: "app", schema: "public" }, "users"), "app.public.users");
  assert.equal(objectPathLabel({ database: "main", schema: null }, "t"), "main.t");
  assert.equal(objectPathLabel({ database: null, schema: null }), "");
});
