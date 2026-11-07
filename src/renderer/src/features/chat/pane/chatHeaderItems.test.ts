import assert from "node:assert/strict";
import { test } from "node:test";
import { hiddenHeaderItems, isDefaultHeaderOrder, isNoopHeaderMove, moveHeaderItem, orderedHeaderSections, sameHiddenItems, sortHeaderItems, toggleHeaderItem } from "./chatHeaderItems";

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

test("orderedHeaderSections: 覚えた並びでまとまりの中を並べ、覚えていない項目は初めの順のまま後ろへ（まとまりの順は変えない）", () => {
  assert.deepEqual(orderedHeaderSections([])[0].items, ["project", "group", "worktree"]);
  const saved = ["worktree", "project", "old-item", "cost"];
  const sections = orderedHeaderSections(saved);
  assert.deepEqual(sections.map((s) => s.title), ["バッジ", "道具", "数", "右の欄"]);
  assert.deepEqual(sections[0].items, ["worktree", "project", "group"]);
  assert.deepEqual(sections[2].items, ["cost", "turns"]);
  assert.deepEqual(sortHeaderItems(saved, ["project", "group", "worktree"]), ["worktree", "project", "group"]);
});

test("moveHeaderItem: 同じまとまりの中だけで動かし、初めの並びに戻ったら空にする", () => {
  const moved = moveHeaderItem([], "worktree", "project", "before");
  assert.deepEqual(orderedHeaderSections(moved)[0].items, ["worktree", "project", "group"]);
  assert.equal(isDefaultHeaderOrder(moved), false);
  // ほかのまとまりへは動かさない
  assert.deepEqual(moveHeaderItem([], "worktree", "find", "after"), []);
  // 戻すと空（初めの値）
  assert.deepEqual(moveHeaderItem(moved, "worktree", "group", "after"), []);
  assert.equal(isDefaultHeaderOrder([]), true);
});

test("isNoopHeaderMove: すぐ前の後ろ・すぐ後ろの前・ほかのまとまりは並びが変わらない", () => {
  assert.equal(isNoopHeaderMove([], "group", "project", "after"), true);
  assert.equal(isNoopHeaderMove([], "group", "worktree", "before"), true);
  assert.equal(isNoopHeaderMove([], "group", "find", "before"), true);
  assert.equal(isNoopHeaderMove([], "group", "project", "before"), false);
  assert.equal(isNoopHeaderMove([], "turns", "cost", "after"), false);
});
