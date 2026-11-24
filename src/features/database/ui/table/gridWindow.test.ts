import assert from "node:assert/strict";
import { test } from "vitest";
import { colLeft, scrollToReveal, visibleRange } from "./gridWindow";

test("visibleRange: 見えている所の前後に余分を足し、行と列の数で切る", () => {
  assert.deepEqual(visibleRange({ top: 0, height: 260, left: 0, width: 400 }, 1000, 50), { first: 0, last: 22, colFirst: 0, colLast: 6 });
  assert.deepEqual(visibleRange({ top: 2600, height: 260, left: 1852, width: 400 }, 1000, 50), { first: 88, last: 122, colFirst: 7, colLast: 16 });
  assert.deepEqual(visibleRange({ top: 0, height: 260, left: 0, width: 400 }, 5, 2), { first: 0, last: 5, colFirst: 0, colLast: 2 });
});

test("scrollToReveal: 隠れていれば寄せ、見えていれば動かさない", () => {
  const view = { top: 260, height: 300, left: 360, width: 600 };
  assert.deepEqual(scrollToReveal(view, 12, 3), { top: 260, left: 360 });
  // 上・左に隠れていれば、その端に
  assert.deepEqual(scrollToReveal(view, 2, 0), { top: 52, left: 0 });
  // 下・右に隠れていれば、見出しと番号の列のぶんを除いて下端・右端に
  assert.deepEqual(scrollToReveal(view, 30, 5), { top: 28 + 30 * 26 + 26 - 300, left: 52 + colLeft(5) + 180 - 600 });
});
