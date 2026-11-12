import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSelection, isLongSelection, LONG_SELECTION_CHARS, LONG_SELECTION_LINES, terminalCaptureLabel, terminalQuote } from "./terminalSelection";

test("cleanSelection: 改行をそろえ、行末の空白と頭と終わりの空行を落とす（字下げは残す）", () => {
  assert.equal(cleanSelection("\n\n$ npm test   \r\n  ok 1\t\n\n"), "$ npm test\n  ok 1");
});

test("isLongSelection: 30 行・3000 文字を超えたら札にする", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");
  assert.equal(isLongSelection(lines(LONG_SELECTION_LINES)), false);
  assert.equal(isLongSelection(lines(LONG_SELECTION_LINES + 1)), true);
  assert.equal(isLongSelection("a".repeat(LONG_SELECTION_CHARS)), false);
  assert.equal(isLongSelection("a".repeat(LONG_SELECTION_CHARS + 1)), true);
});

test("terminalQuote: 見出しとコードのブロック。中の ``` より長い囲みにする", () => {
  assert.equal(terminalQuote("$ ls\na b"), "ターミナルの出力:\n```\n$ ls\na b\n```");
  assert.equal(terminalQuote("x ``` y"), "ターミナルの出力:\n````\nx ``` y\n````");
});

test("terminalCaptureLabel: フォルダの名前と行数", () => {
  assert.equal(terminalCaptureLabel("/Users/me/kickoff/", "a\nb\nc"), "kickoff・3 行");
  assert.equal(terminalCaptureLabel("/", "a"), "/・1 行");
});
