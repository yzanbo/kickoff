import assert from "node:assert/strict";
import { test } from "vitest";
import { noteMarkdownParser } from "./noteMarkdown";
import { tableBlocks } from "./tableBlocks";
import { alignTableChanges, escapeCellInput, fillMissingCell, isAlignedTable, type TextChange } from "./tableEdit";
import { bodyRows } from "./tableModel";

const tableOf = (text: string) => tableBlocks(noteMarkdownParser.parse(text), text)[0];
/** 書き換えを後ろから当てる（どれも元の文の位置） */
const apply = (text: string, changes: TextChange[]) => [...changes].sort((a, b) => b.from - a.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text);

test("escapeCellInput: | は \\| に、改行は <br> に（\\ で消してある | はそのまま）", () => {
  assert.equal(escapeCellInput("a|b"), "a\\|b");
  assert.equal(escapeCellInput("a\\|b"), "a\\|b");
  assert.equal(escapeCellInput("x\\\\|y"), "x\\\\\\|y");
  assert.equal(escapeCellInput("1行\n2行\r\n3行"), "1行<br>2行<br>3行");
});

test("fillMissingCell: 足りないセルに書くと、行の書き方（終わりの | の有無）に合わせて | を足す", () => {
  const text = "| a | b | c |\n|---|---|---|\n| 1 |";
  const t = tableOf(text);
  const { change, cellFrom } = fillMissingCell(text, bodyRows(t)[1], 2, "x");
  const after = apply(text, [change]);
  assert.equal(after.split("\n")[2], "| 1 | | x |");
  assert.equal(after.slice(cellFrom, cellFrom + 1), "x");
  const bare = "a | b | c\n--|--|--\n1";
  const r = fillMissingCell(bare, bodyRows(tableOf(bare))[1], 1, "y");
  const out = apply(bare, [r.change]);
  assert.equal(out.split("\n")[2], "1 | y");
  assert.equal(out.slice(r.cellFrom, r.cellFrom + 1), "y");
});

test("isAlignedTable: | の位置がどの行も同じ表だけ（詰めた表はそろえていない扱い）", () => {
  assert.equal(isAlignedTable("| a   | bb |\n| --- | -- |\n| 123 | c  |", tableOf("| a   | bb |\n| --- | -- |\n| 123 | c  |")), true);
  const compact = "| a | b |\n|---|---|\n| 1 | 2 |";
  assert.equal(isAlignedTable(compact, tableOf(compact)), false);
  const ja = "| そろえた | 表   |\n| -------- | ---- |\n| あ       | 1    |";
  assert.equal(isAlignedTable(ja, tableOf(ja)), true);
  const loose = "| 名前 | 中身 |\n|---|---|\n| 長い名前 | x |";
  assert.equal(isAlignedTable(loose, tableOf(loose)), false);
});

test("alignTableChanges: そろえた表は、列の幅と寄せに合わせて書き直す（変わる行だけ）", () => {
  const text = "| a   | b   |\n| :-- | --: |\n| 12345 | 1 |";
  assert.equal(apply(text, alignTableChanges(text, tableOf(text))), "| a     |   b |\n| :---- | --: |\n| 12345 |   1 |");
  // 日本語は 2 桁ぶんの幅でそろえる
  const ja = "| そろえた | 表   |\n| -------- | ---- |\n| あいうえおか | 1    |";
  assert.equal(apply(ja, alignTableChanges(ja, tableOf(ja))), "| そろえた     | 表  |\n| ------------ | --- |\n| あいうえおか | 1   |");
  const ok = "| a   | b   |\n| --- | --- |\n| 1   | 2   |";
  assert.deepEqual(alignTableChanges(ok, tableOf(ok)), []);
});
