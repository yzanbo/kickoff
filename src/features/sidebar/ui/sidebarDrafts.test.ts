import assert from "node:assert/strict";
import { test } from "vitest";
import { splitPinnedDrafts } from "./sidebarDrafts";

test("まとめるときは、ピン留めした下書きを抜き出さず、先頭に並べる（元の並びは変えない）", () => {
  const drafts = [
    { id: 1, pinned: false, group: 4 },
    { id: 2, pinned: true, group: 5 },
    { id: 3, pinned: true, worktree: "/wt" },
    { id: 4, pinned: false },
  ];
  const result = splitPinnedDrafts(drafts, false);
  assert.deepEqual(result.drafts.map((d) => d.id), [2, 3, 1, 4]);
  assert.deepEqual(result.pinnedDrafts, []);
  assert.deepEqual(drafts.map((d) => d.id), [1, 2, 3, 4]);
});

test("まとめないときは、ピン留めした下書きを従来どおり「固定」に抜き出す", () => {
  const drafts = [{ id: 1, pinned: false }, { id: 2, pinned: true }];
  assert.deepEqual(splitPinnedDrafts(drafts, true), { drafts: [drafts[0]], pinnedDrafts: [drafts[1]] });
  assert.deepEqual(splitPinnedDrafts([drafts[1]], true), { drafts: [], pinnedDrafts: [drafts[1]] });
  assert.equal(splitPinnedDrafts([drafts[0]], false).pinnedDrafts.length, 0);
});
