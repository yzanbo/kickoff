import assert from "node:assert/strict";
import { test } from "node:test";
import { stepIndex } from "./useListNavigation";

test("stepIndex: ↑↓ で 1 つずつ動き、端では回り込む", () => {
  assert.equal(stepIndex(0, 1, 3), 1);
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(1, -1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
});

test("stepIndex: まだ選んでいなければ、↓ で先頭・↑ で最後", () => {
  assert.equal(stepIndex(-1, 1, 3), 0);
  assert.equal(stepIndex(-1, -1, 3), 2);
  // 候補が減って範囲の外になった位置も、選んでいないのと同じ
  assert.equal(stepIndex(5, 1, 3), 0);
  assert.equal(stepIndex(5, -1, 3), 2);
});

test("stepIndex: 候補が 1 つなら動かず、なければ -1", () => {
  assert.equal(stepIndex(0, 1, 1), 0);
  assert.equal(stepIndex(0, -1, 1), 0);
  assert.equal(stepIndex(0, 1, 0), -1);
});
