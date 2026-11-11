import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbColumnInfo, DbValue } from "@shared/types";
import { addInserts, buildEdits, displayRows, editableText, editCounts, NO_EDITS, removeInsert, revertCell, rowKey, setCell, setInsertCell, toggleDelete } from "./tableEdits";

const cols: DbColumnInfo[] = [
  { name: "id", type: "integer" },
  { name: "name", type: "text" },
  { name: "blob", type: "blob" },
];
const bin = { binary: true as const, bytes: 2, head: "0102" };
const rows: DbValue[][] = [
  [1, "a", null],
  [2, null, bin],
];

test("rowKey: キーの列の値の並び。キーがない・バイナリなら null", () => {
  assert.equal(rowKey(cols, rows[0], ["id"]), "[1]");
  assert.equal(rowKey(cols, rows[1], ["id", "name"]), "[2,null]");
  assert.equal(rowKey(cols, rows[1], ["blob"]), null);
  assert.equal(rowKey(cols, rows[0], null), null);
  assert.equal(rowKey(cols, rows[0], ["nope"]), null);
});

test("editableText: NULL は空、バイナリは書き換えられない", () => {
  assert.equal(editableText(null), "");
  assert.equal(editableText(3.5), "3.5");
  assert.equal(editableText(true), "true");
  assert.equal(editableText(bin), null);
});

test("setCell / revertCell: 読んだ値に戻したら変更を消す", () => {
  let e = setCell(NO_EDITS, "[1]", "name", "b", "a");
  assert.deepEqual(e.changes, { "[1]": { name: "b" } });
  e = setCell(e, "[1]", "name", "a", "a");
  assert.deepEqual(e.changes, {});
  e = setCell(e, "[2]", "name", "", null);
  assert.deepEqual(e.changes, { "[2]": { name: "" } });
  assert.deepEqual(setCell(e, "[2]", "name", null, null).changes, {});
  assert.deepEqual(setCell(NO_EDITS, "[1]", "id", "1", 1).changes, {});
  assert.deepEqual(revertCell(e, "[2]", "name").changes, {});
  assert.equal(revertCell(e, "[9]", "name"), e);
});

test("buildEdits: 消す → 書き換える（消す行は送らない）→ 足す。数も同じ決まり", () => {
  let e = setCell(NO_EDITS, "[1]", "name", "x", "a");
  e = setCell(e, "[2]", "name", "y", null);
  e = toggleDelete(e, "[2]");
  e = addInserts(e, [{ name: "new" }, {}]);
  e = setInsertCell(e, 2, "id", "10");
  assert.deepEqual(buildEdits(e, ["id"]), [
    { kind: "delete", key: { id: 2 } },
    { kind: "update", key: { id: 1 }, values: { name: "x" } },
    { kind: "insert", values: { name: "new" } },
    { kind: "insert", values: { id: "10" } },
  ]);
  assert.deepEqual(editCounts(e), { updates: 1, inserts: 2, deletes: 1, total: 4 });
  assert.deepEqual(toggleDelete(e, "[2]").deletes, []);
  assert.deepEqual(
    removeInsert(e, 1).inserts.map((r) => r.id),
    [2],
  );
  assert.deepEqual(setInsertCell(e, 2, "id", undefined).inserts[1].values, {});
  assert.throws(() => buildEdits(e, null), /キー/);
});

test("displayRows: 書き換えを重ね、足す行を後ろに。行とセルの様子", () => {
  let e = setCell(NO_EDITS, "[1]", "name", "x", "a");
  e = toggleDelete(e, "[2]");
  e = addInserts(e, [{ name: "n" }]);
  const d = displayRows(cols, rows, ["id"], e);
  assert.deepEqual(d.rows, [[1, "x", null], [2, null, bin], [null, "n", null]]);
  assert.deepEqual(d.keys, ["[1]", "[2]", null]);
  assert.deepEqual(d.insertIds, [null, null, 1]);
  assert.deepEqual([0, 1, 2].map(d.rowState), [null, "deleted", "added"]);
  assert.deepEqual([d.cellState(0, 1), d.cellState(0, 0), d.cellState(2, 0), d.cellState(2, 1)], ["changed", null, "default", "changed"]);
  // 何も変えていなければ読んだ行をそのまま
  assert.equal(displayRows(cols, rows, null, NO_EDITS).rows[0], rows[0]);
});
