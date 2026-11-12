import assert from "node:assert/strict";
import { test } from "node:test";
import { ansiSpans, markSpans, stripAnsi } from "./ansi";

test("ansiSpans: 色のない行は 1 つ", () => {
  assert.deepEqual(ansiSpans("hello"), [{ text: "hello", fg: null, bg: null, bold: false, dim: false, italic: false, underline: false }]);
});

test("ansiSpans: 16 色・太字・戻す・256 色・24 bit", () => {
  const spans = ansiSpans("\u001b[1;31mERR\u001b[0m ok \u001b[38;5;196mx\u001b[38;2;1;2;3my\u001b[39mz");
  assert.deepEqual(
    spans.map((s) => [s.text, s.fg, s.bold]),
    [
      ["ERR", 1, true],
      [" ok ", null, false],
      ["x", "rgb(255, 0, 0)", false],
      ["y", "rgb(1, 2, 3)", false],
      ["z", null, false],
    ],
  );
  assert.equal(ansiSpans("\u001b[92mhi")[0].fg, 10);
});

test("stripAnsi: 色とほかの制御の印を落とす", () => {
  assert.equal(stripAnsi("\u001b[32minfo\u001b[0m \u001b[2Kdone\u001b]0;title\u0007!"), "info done!");
});

test("markSpans: 色の境目と見つけた所の境目で切り、いま選んでいる所は 2", () => {
  const spans = ansiSpans("ab\u001b[31mcdef\u001b[0mg");
  const marked = markSpans(spans, [{ start: 1, end: 3 }, { start: 5, end: 7 }], 1);
  assert.deepEqual(
    marked.map((s) => [s.text, s.fg, s.mark]),
    [
      ["a", null, 0],
      ["b", null, 1],
      ["c", 1, 1],
      ["de", 1, 0],
      ["f", 1, 2],
      ["g", null, 2],
    ],
  );
});
