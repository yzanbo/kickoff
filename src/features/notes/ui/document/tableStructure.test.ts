import assert from "node:assert/strict";
import { test } from "vitest";
import { noteMarkdownParser } from "./noteMarkdown";
import { splitTableRow, tableBlocks } from "./tableBlocks";
import type { TextChange } from "./tableEdit";
import { deleteColumn, deleteRow, deleteTable, insertColumn, insertRow, insertTableAt, NEW_TABLE, setColumnAlign } from "./tableStructure";

const tableOf = (text: string) => tableBlocks(noteMarkdownParser.parse(text), text)[0];
const apply = (text: string, changes: TextChange[]) => [...changes].sort((a, b) => b.from - a.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text);
/** 書き換えたあとも表として読めて、行と列の数が思ったとおりか */
function shape(text: string) {
  const t = tableOf(text);
  const rows = t.rows.filter((r) => !r.delimiter);
  return { rows: rows.length, cells: rows.map((r) => splitTableRow(text.slice(r.from, r.to), r.from).map((c) => text.slice(c.from, c.to)).join(",")) };
}

const T = "| a | b |\n|---|---|\n| 1 | 2 |";

test("insertRow: 上・下に空の行を足す（見出しの下は区切りの行の下）。リストの字下げも同じに", () => {
  const below = insertRow(T, tableOf(T), 0, "below");
  assert.equal(apply(T, below.changes), "| a | b |\n|---|---|\n|  |  |\n| 1 | 2 |");
  assert.equal(below.row, 1);
  const above = insertRow(T, tableOf(T), 1, "above");
  assert.equal(apply(T, above.changes), "| a | b |\n|---|---|\n|  |  |\n| 1 | 2 |");
  const last = insertRow(T, tableOf(T), 1, "below");
  assert.equal(apply(T, last.changes), `${T}\n|  |  |`);
  assert.equal(last.row, 2);
  const list = "- x\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |";
  assert.equal(apply(list, insertRow(list, tableOf(list), 1, "below").changes).split("\n").pop(), "  |  |  |");
});

test("deleteRow: 行を改行ごと消す（見出しの行は消さない）", () => {
  assert.equal(apply(T, deleteRow(T, tableOf(T), 1)), "| a | b |\n|---|---|");
  assert.deepEqual(deleteRow(T, tableOf(T), 0), []);
  const mid = `${T}\n| 3 | 4 |\n\n後`;
  assert.equal(apply(mid, deleteRow(mid, tableOf(mid), 1)), "| a | b |\n|---|---|\n| 3 | 4 |\n\n後");
});

test("insertColumn: 左・右・最後に列を足す（ほかのセルの書き方は変えない。頭と終わりに | のない表も）", () => {
  assert.deepEqual(shape(apply(T, insertColumn(T, tableOf(T), 0, "right").changes)).cells, ["a,,b", "1,,2"]);
  assert.equal(apply(T, insertColumn(T, tableOf(T), 0, "right").changes), "| a | | b |\n|---|---|---|\n| 1 | | 2 |");
  assert.deepEqual(shape(apply(T, insertColumn(T, tableOf(T), 0, "left").changes)).cells, [",a,b", ",1,2"]);
  assert.deepEqual(shape(apply(T, insertColumn(T, tableOf(T), 1, "right").changes)).cells, ["a,b,", "1,2,"]);
  const bare = "a | b\n--|--\n1 | 2";
  assert.deepEqual(shape(apply(bare, insertColumn(bare, tableOf(bare), 0, "left").changes)).cells, [",a,b", ",1,2"]);
  assert.deepEqual(shape(apply(bare, insertColumn(bare, tableOf(bare), 1, "right").changes)).cells, ["a,b,", "1,2,"]);
  assert.equal(insertColumn(T, tableOf(T), 1, "left").col, 1);
});

test("deleteColumn: 列を消す（列が 1 つなら消さない。短い行はそのまま）", () => {
  const t3 = "| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| x |";
  assert.deepEqual(shape(apply(t3, deleteColumn(t3, tableOf(t3), 1))).cells, ["a,c", "1,3", "x"]);
  assert.deepEqual(shape(apply(t3, deleteColumn(t3, tableOf(t3), 2))).cells, ["a,b", "1,2", "x"]);
  assert.deepEqual(shape(apply(t3, deleteColumn(t3, tableOf(t3), 0))).cells, ["b,c", "2,3", ""]);
  const bare = "a | b\n--|--\n1 | 2";
  assert.deepEqual(shape(apply(bare, deleteColumn(bare, tableOf(bare), 0))).cells, ["b", "2"]);
  const one = "| a |\n|---|\n| 1 |";
  assert.deepEqual(deleteColumn(one, tableOf(one), 0), []);
});

test("setColumnAlign: 区切りの行の : を付け替える", () => {
  assert.equal(apply(T, setColumnAlign(T, tableOf(T), 1, "center")).split("\n")[1], "|---|:-:|");
  assert.equal(apply(T, setColumnAlign(T, tableOf(T), 0, "right")).split("\n")[1], "|--:|---|");
  const c = "| a |\n|:---:|\n| 1 |";
  assert.equal(apply(c, setColumnAlign(c, tableOf(c), 0, null)).split("\n")[1], "|---|");
});

test("deleteTable・insertTableAt: 表を消す・空の行か文の後ろに表を入れる", () => {
  assert.equal(apply(`前\n\n${T}\n\n後`, deleteTable(`前\n\n${T}\n\n後`, tableOf(`前\n\n${T}\n\n後`))), "前\n\n\n後");
  const empty = insertTableAt("前\n\n\n後", 3);
  assert.equal(apply("前\n\n\n後", [empty.change]), `前\n\n${NEW_TABLE}\n後`);
  const after = insertTableAt("文の行", 1);
  const out = apply("文の行", [after.change]);
  assert.equal(out, `文の行\n\n${NEW_TABLE}`);
  assert.equal(out.slice(after.tableFrom, after.tableFrom + 3), "|  ");
  assert.equal(shape(out).rows, 2);
});
