import assert from "node:assert/strict";
import { test } from "vitest";
import { boxesOverlap, intersectBoxes, sameBox } from "./devtoolsBox";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

test("重なり: 辺が接するだけなら重ならない", () => {
  assert.equal(boxesOverlap(box(0, 0, 100, 100), box(50, 50, 100, 100)), true);
  assert.equal(boxesOverlap(box(0, 0, 100, 100), box(100, 0, 50, 50)), false);
  assert.equal(boxesOverlap(box(0, 0, 100, 100), box(0, 100, 50, 50)), false);
  // メニューが開発者ツールの中に収まっている
  assert.equal(boxesOverlap(box(0, 0, 100, 100), box(10, 10, 20, 20)), true);
});

test("重なった部分: 欄の外にはみ出した分を切る", () => {
  assert.deepEqual(intersectBoxes(box(0, 0, 100, 100), box(50, 20, 100, 100)), box(50, 20, 50, 80));
  assert.equal(intersectBoxes(box(0, 0, 100, 100), box(100, 0, 50, 50)), null);
});

test("同じ置き場所: 0.5px 未満の違いは同じ・なしどうしは同じ", () => {
  assert.equal(sameBox(box(0, 0, 100, 100), box(0.2, 0, 100.3, 100)), true);
  assert.equal(sameBox(box(0, 0, 100, 100), box(1, 0, 100, 100)), false);
  assert.equal(sameBox(null, null), true);
  assert.equal(sameBox(null, undefined), false);
  assert.equal(sameBox(box(0, 0, 1, 1), null), false);
});
