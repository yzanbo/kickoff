import assert from "node:assert/strict";
import { test } from "vitest";
import { noteMarkdownParser } from "./noteMarkdown";
import { tableBlocks } from "./tableBlocks";
import { bodyRows, cellAt, cellRange, columnAligns, delimiterRow, markdownWithoutCell, nextCell, previousCell } from "./tableModel";

const tableOf = (text: string) => tableBlocks(noteMarkdownParser.parse(text), text)[0];

test("tableModel: 何行目・何列目と元の文字の範囲（区切りの行は数えない・足りないセルは null）", () => {
  const text = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |";
  const t = tableOf(text);
  const cell = (row: number, col: number) => {
    const r = cellRange(text, t, { row, col });
    return r && text.slice(r.from, r.to);
  };
  assert.deepEqual([cell(0, 1), cell(1, 0), cell(2, 0), cell(2, 1)], ["b", "1", "3", null]);
  assert.deepEqual(cellAt(text, t, text.indexOf("2")), { row: 1, col: 1 });
  // 区切りの行は見出しに、行の頭の | は最初のセルに寄せる
  assert.deepEqual(cellAt(text, t, text.indexOf("---")), { row: 0, col: 0 });
  assert.deepEqual(cellAt(text, t, text.indexOf("| 3")), { row: 2, col: 0 });
  assert.equal(bodyRows(t).length, 3);
});

test("tableModel: 次のセル・前のセル（行の終わりは次の行の頭、端は null）", () => {
  assert.deepEqual(nextCell({ row: 0, col: 1 }, 2, 3), { row: 1, col: 0 });
  assert.equal(nextCell({ row: 2, col: 1 }, 2, 3), null);
  assert.deepEqual(previousCell({ row: 1, col: 0 }, 2), { row: 0, col: 1 });
  assert.equal(previousCell({ row: 0, col: 0 }, 2), null);
});

test("tableModel: 区切りの行と、そこから読む列の寄せ", () => {
  const text = "| a | b | c |\n|:--|:-:|---|\n| 1 | 2 | 3 |";
  const t = tableOf(text);
  const d = delimiterRow(t);
  assert.equal(d && text.slice(d.from, d.to), "|:--|:-:|---|");
  assert.deepEqual(columnAligns(text, t), ["left", "center", null]);
});

test("markdownWithoutCell: 書いているセルの中身だけを抜いた表の Markdown", () => {
  const text = "- x\n\n  | a | b |\n  |---|---|\n  | 1 | 22 |";
  const t = tableOf(text);
  const range = cellRange(text, t, { row: 1, col: 1 });
  assert.ok(range);
  assert.equal(markdownWithoutCell(text, t, range), "| a | b |\n|---|---|\n| 1 |  |");
});
