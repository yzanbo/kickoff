import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenItemsOf, sameHiddenItemsOf, toggleHiddenItem } from "./hiddenItems";

const ALL = ["a", "b", "c"] as const;

test("hiddenItemsOf: 知っている項目だけを取り出す（消した項目の名前は見ない）", () => {
  assert.deepEqual([...hiddenItemsOf(ALL, ["c", "gone", "a"])].sort(), ["a", "c"]);
  assert.equal(hiddenItemsOf(ALL, []).size, 0);
});

test("sameHiddenItemsOf: 順・知らない名前によらず、隠している項目が同じか", () => {
  assert.equal(sameHiddenItemsOf(ALL, ["b", "a"], ["a", "b", "gone"]), true);
  assert.equal(sameHiddenItemsOf(ALL, ["a"], ["a", "b"]), false);
});

test("toggleHiddenItem: 出す・隠すを入れ替え、項目の一覧の順にそろえる", () => {
  assert.deepEqual(toggleHiddenItem(ALL, ["c"], "a"), ["a", "c"]);
  assert.deepEqual(toggleHiddenItem(ALL, ["c", "a", "gone"], "c"), ["a"]);
});
