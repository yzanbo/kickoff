import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenHeaderItems, hidesMoreHeaderItems, toggleHeaderItem } from "./chatHeaderItems";

test("hiddenHeaderItems: 知らない名前は無視する", () => {
  assert.deepEqual([...hiddenHeaderItems(["cost", "old-item", "project"])].sort(), ["cost", "project"]);
});

test("toggleHeaderItem: 隠す・出すを入れ替え、項目の順にそろえる", () => {
  assert.deepEqual(toggleHeaderItem([], "cost"), ["cost"]);
  assert.deepEqual(toggleHeaderItem(["cost"], "project"), ["project", "cost"]);
  assert.deepEqual(toggleHeaderItem(["project", "cost"], "cost"), ["project"]);
  assert.deepEqual(toggleHeaderItem(["old-item"], "find"), ["find"]);
});

test("hidesMoreHeaderItems: 既定より多く隠しているときだけ（既定の分を出しても点は付けない）", () => {
  const initial = ["textWidth", "sticky"];
  assert.equal(hidesMoreHeaderItems(initial, initial), false);
  assert.equal(hidesMoreHeaderItems([], initial), false);
  assert.equal(hidesMoreHeaderItems(["textWidth", "cost"], initial), true);
});
