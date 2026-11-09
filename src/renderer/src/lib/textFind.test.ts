import assert from "node:assert/strict";
import { test } from "node:test";
import { findInTexts, stepMatch } from "./textFind";

test("findInTexts: ノードごとに、大文字・小文字を区別せず前から順に合う位置を返す（重ならない）", () => {
  assert.deepEqual(findInTexts(["Abc abc", "x", "ABCabc"], "abc"), [
    { node: 0, start: 0, end: 3 },
    { node: 0, start: 4, end: 7 },
    { node: 2, start: 0, end: 3 },
    { node: 2, start: 3, end: 6 },
  ]);
  assert.deepEqual(findInTexts(["aaaa"], "aa"), [
    { node: 0, start: 0, end: 2 },
    { node: 0, start: 2, end: 4 },
  ]);
  assert.deepEqual(findInTexts(["日本語の文"], "語の"), [{ node: 0, start: 2, end: 4 }]);
  assert.deepEqual(findInTexts(["abc"], ""), []);
});

test("stepMatch: 端で回り込み、まだ選んでいなければ次は最初・前は最後", () => {
  assert.equal(stepMatch(null, 3, 1), 0);
  assert.equal(stepMatch(null, 3, -1), 2);
  assert.equal(stepMatch(2, 3, 1), 0);
  assert.equal(stepMatch(0, 3, -1), 2);
  assert.equal(stepMatch(null, 0, 1), null);
});
