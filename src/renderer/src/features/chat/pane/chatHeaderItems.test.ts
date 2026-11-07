import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenHeaderItems, sameHiddenItems, toggleHeaderItem } from "./chatHeaderItems";

test("hiddenHeaderItems: 知らない名前は無視する", () => {
  assert.deepEqual([...hiddenHeaderItems(["cost", "old-item", "project"])].sort(), ["cost", "project"]);
});

test("toggleHeaderItem: 隠す・出すを入れ替え、項目の順にそろえる", () => {
  assert.deepEqual(toggleHeaderItem([], "cost"), ["cost"]);
  assert.deepEqual(toggleHeaderItem(["cost"], "project"), ["project", "cost"]);
  assert.deepEqual(toggleHeaderItem(["project", "cost"], "cost"), ["project"]);
  assert.deepEqual(toggleHeaderItem(["old-item"], "find"), ["find"]);
});

test("sameHiddenItems: 順と知らない名前は見ずに、隠している項目が同じかを比べる", () => {
  assert.equal(sameHiddenItems(["cost", "project"], ["project", "cost"]), true);
  assert.equal(sameHiddenItems(["project", "old-item"], ["project"]), true);
  assert.equal(sameHiddenItems(["project"], ["project", "cost"]), false);
  assert.equal(sameHiddenItems([], []), true);
});
