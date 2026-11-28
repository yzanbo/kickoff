import assert from "node:assert/strict";
import { test } from "vitest";
import { noteMarkdownParser } from "./noteMarkdown";
import { pipeIndexes, rowFraming, splitTableRow, tableAligns, tableBlocks } from "./tableBlocks";

const blocksOf = (text: string) => tableBlocks(noteMarkdownParser.parse(text), text);
const cellsOf = (content: string) => splitTableRow(content, 0).map(({ from, to }) => content.slice(from, to));

test("tableBlocks: 表の行の場所と、表だけの Markdown（リストの字下げ・引用の > を除く）", () => {
  const text = "前\n\n- 項目\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |\n\n後";
  const [t] = blocksOf(text);
  assert.equal(text.slice(t.from, t.to), "  | a | b |\n  |---|---|\n  | 1 | 2 |");
  assert.equal(t.markdown, "| a | b |\n|---|---|\n| 1 | 2 |");
  assert.equal(t.prefix, "  ");
  assert.deepEqual(
    t.rows.map((r) => [text.slice(r.lineFrom, r.from), text.slice(r.from, r.to), r.delimiter]),
    [
      ["  ", "| a | b |", false],
      ["  ", "|---|---|", true],
      ["  ", "| 1 | 2 |", false],
    ],
  );
  const [q] = blocksOf("> | a |\n> |---|\n> | 1 |");
  assert.equal(q.markdown, "| a |\n|---|\n| 1 |");
  assert.equal(q.prefix, "> ");
});

test("splitTableRow: \\ で消した | は区切りにせず、空のセルは左の | の後ろの位置", () => {
  assert.deepEqual(cellsOf("| a | b \\| c |"), ["a", "b \\| c"]);
  assert.deepEqual(cellsOf("a | b"), ["a", "b"]);
  assert.deepEqual(cellsOf("| 1 || 3 |"), ["1", "", "3"]);
  assert.deepEqual(splitTableRow("| 1 || 3 |", 10), [
    { from: 12, to: 13 },
    { from: 15, to: 15 },
    { from: 17, to: 18 },
  ]);
  assert.deepEqual(splitTableRow("|  | b |", 0)[0], { from: 2, to: 2 });
});

test("pipeIndexes・rowFraming: \\ で消した | は数えず、頭と終わりの | を見分ける", () => {
  assert.deepEqual(pipeIndexes("| a \\| b |"), [0, 9]);
  assert.deepEqual(pipeIndexes("x| a | b |", 1, 5), [1]);
  assert.deepEqual(rowFraming("  | a | b |  "), { lead: true, trail: true });
  assert.deepEqual(rowFraming("a | b \\|"), { lead: false, trail: false });
  assert.deepEqual(rowFraming("a |"), { lead: false, trail: true });
});

test("tableAligns: 区切りの行の : から列の寄せ", () => {
  assert.deepEqual(tableAligns("|:--|:-:|--:|---|"), ["left", "center", "right", null]);
});
