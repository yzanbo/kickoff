import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbColumnInfo, DbValue } from "@shared/types";
import { columnKeysOf, detailText, exportRows, foreignKeysByColumn, hasLongValue, linkFilters, rowKeyFilters, valueFilter } from "./dbRowTools";

const cols: DbColumnInfo[] = [
  { name: "id", type: "integer" },
  { name: "user_id", type: "integer" },
  { name: "note", type: "text" },
];

test("valueFilter: 値で絞る / 除く（NULL は NULL / NULL でない・バイナリは絞れない）", () => {
  assert.deepEqual(valueFilter("id", 3, false), { column: "id", op: "eq", value: "3" });
  assert.deepEqual(valueFilter("note", "x", true), { column: "note", op: "ne", value: "x" });
  assert.deepEqual(valueFilter("note", null, false), { column: "note", op: "is_null", value: "" });
  assert.deepEqual(valueFilter("note", null, true), { column: "note", op: "not_null", value: "" });
  assert.equal(valueFilter("b", { binary: true, bytes: 2, head: "0102" }, false), null);
});

test("linkFilters: 行の値でつながった行を探す条件（複数の列の外部キーも。NULL ならつながりなし）", () => {
  const row: DbValue[] = [7, 42, null];
  assert.deepEqual(linkFilters(row, cols, ["user_id"], ["id"]), [{ column: "id", op: "eq", value: "42" }]);
  assert.deepEqual(linkFilters(row, cols, ["id", "user_id"], ["a", "b"]), [
    { column: "a", op: "eq", value: "7" },
    { column: "b", op: "eq", value: "42" },
  ]);
  assert.equal(linkFilters(row, cols, ["note"], ["id"]), null);
  assert.equal(linkFilters(row, cols, ["missing"], ["id"]), null);
  const fk = { name: null, columns: ["user_id"], ref_schema: null, ref_table: "users", ref_columns: ["id"], on_update: null, on_delete: null };
  assert.deepEqual([...foreignKeysByColumn([fk]).keys()], ["user_id"]);
});

test("detailText: JSON は整え、空文字・NULL・バイナリは分かる形に", () => {
  assert.deepEqual(detailText('{"a":1}'), { text: '{\n  "a": 1\n}', kind: "json" });
  assert.deepEqual(detailText("{not json"), { text: "{not json", kind: "text" });
  assert.deepEqual(detailText(""), { text: "（空文字）", kind: "empty" });
  assert.equal(detailText(null).kind, "null");
  assert.equal(detailText({ binary: true, bytes: 20, head: "00ff" }).text, "20 バイト\n00ff…");
});

test("exportRows: CSV は区切り・\"・改行を含むセルだけ囲み、TSV はタブと改行を空白に、JSON は列の名前のオブジェクト", () => {
  const rows: DbValue[][] = [
    [1, null, 'a,"b"'],
    [2, 3, "x\ty\nz"],
  ];
  assert.equal(exportRows(cols, rows, "csv"), 'id,user_id,note\n1,,"a,""b"""\n2,3,"x\ty\nz"\n');
  assert.equal(exportRows(cols, rows, "tsv"), 'id\tuser_id\tnote\n1\t\ta,"b"\n2\t3\tx y z\n');
  assert.deepEqual(JSON.parse(exportRows(cols, rows.slice(0, 1), "json")), [{ id: 1, user_id: null, note: 'a,"b"' }]);
  assert.equal(exportRows(cols.slice(0, 1), [[{ binary: true, bytes: 2, head: "0102" }]], "csv"), "id\n\\x0102\n");
});

test("頭だけの長い文字: 絞れない・行の詳細は頭と「…」・書き出しは頭・行を指す条件はキーの列から", () => {
  const long: DbValue = { long: true, head: "ab", chars: 20_000 };
  assert.equal(valueFilter("note", long, false), null);
  assert.deepEqual(detailText(long), { text: "ab…", kind: "long" });
  assert.equal(exportRows(cols.slice(2), [[long]], "csv"), "note\nab\n");
  assert.equal(hasLongValue([1, null, long]), true);
  assert.equal(hasLongValue([1, "x"]), false);
  assert.deepEqual(rowKeyFilters(cols, [3, null, long], ["id"]), [{ column: "id", op: "eq", value: "3" }]);
  assert.deepEqual(rowKeyFilters(cols, [3, null, long], ["id", "user_id"]), [
    { column: "id", op: "eq", value: "3" },
    { column: "user_id", op: "is_null", value: "" },
  ]);
  assert.equal(rowKeyFilters(cols, [3, null, long], ["note"]), null);
  assert.equal(rowKeyFilters(cols, [3, null, long], null), null);
  assert.equal(rowKeyFilters(cols, [3, null, long], ["nope"]), null);
});

test("columnKeysOf: 主キーの列と、外部キーの列ごとの参照先（複数の列の外部キーは対応する列を）", () => {
  const col = (name: string, primary_key = false) => ({ name, type: "int", nullable: false, default: null, primary_key, comment: null });
  const fk = (columns: string[], ref_table: string, ref_columns: string[], ref_schema: string | null = null) => ({ name: null, columns, ref_schema, ref_table, ref_columns, on_update: null, on_delete: null });
  const keys = columnKeysOf({ columns: [col("id", true), col("user_id"), col("a"), col("b")], foreign_keys: [fk(["user_id"], "users", ["id"], "public"), fk(["a", "b"], "pairs", ["x", "y"])] });
  assert.deepEqual([...keys.primary], ["id"]);
  assert.deepEqual(Object.fromEntries(keys.foreign), { user_id: "public.users.id", a: "pairs.x", b: "pairs.y" });
});
