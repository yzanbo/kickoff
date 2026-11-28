import assert from "node:assert/strict";
import { test } from "vitest";
import { lineEndOf, lineStartOf, walkBlocks } from "./blockWalk";
import { noteMarkdownParser } from "./noteMarkdown";

const TEXT = "# 見出し\n\n- 項目\n\n  段落\n\n> 引用の段落";
const namesOf = (options?: Parameters<typeof walkBlocks>[2]) => {
  const names: string[] = [];
  walkBlocks(noteMarkdownParser.parse(TEXT), (node) => void names.push(node.name), options);
  return names;
};

test("walkBlocks: リストの中はたどり、引用の中は quotes のときだけ。範囲の外の節は渡さない", () => {
  assert.deepEqual(namesOf(), ["ATXHeading1", "ListMark", "Paragraph", "Paragraph", "Blockquote"]);
  assert.deepEqual(namesOf({ quotes: true }).slice(-2), ["QuoteMark", "Paragraph"]);
  assert.deepEqual(namesOf({ from: TEXT.indexOf(">") }), ["Blockquote"]);
});

test("walkBlocks: visit が true を返したらやめる", () => {
  const names: string[] = [];
  walkBlocks(noteMarkdownParser.parse(TEXT), (node) => names.push(node.name) > 1);
  assert.deepEqual(names, ["ATXHeading1", "ListMark"]);
});

test("lineStartOf・lineEndOf: pos を含む行の頭と終わり", () => {
  assert.equal(lineStartOf("ab\ncd", 4), 3);
  assert.equal(lineStartOf("ab\ncd", 3), 3);
  assert.equal(lineEndOf("ab\ncd", 1), 2);
  assert.equal(lineEndOf("ab\ncd", 3), 5);
});
