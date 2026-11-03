import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTags, matchesTags, normalizeTags, UNTAGGED } from "./projectTags.js";

test("normalizeTags: 前後の空白・空・重複を除き、最初に出てきた順のまま", () => {
  assert.deepEqual(normalizeTags([" 仕事", "", "プライベート ", "仕事", "  "]), ["仕事", "プライベート"]);
});

test("collectTags: 使っているタグを重複なしの名前順で", () => {
  assert.deepEqual(collectTags([{ tags: ["b", "a"] }, { tags: [] }, { tags: ["a", "c"] }]), ["a", "b", "c"]);
});

test("matchesTags: 選んだタグのどれかが付いていれば合う。タグなしは UNTAGGED を選んだときだけ", () => {
  assert.equal(matchesTags(["a"], []), true);
  assert.equal(matchesTags([], []), true);
  assert.equal(matchesTags(["a", "b"], ["b", "c"]), true);
  assert.equal(matchesTags(["a"], ["c"]), false);
  assert.equal(matchesTags([], ["c"]), false);
  assert.equal(matchesTags([], [UNTAGGED]), true);
  assert.equal(matchesTags(["a"], [UNTAGGED]), false);
  assert.equal(matchesTags(["a"], [UNTAGGED, "a"]), true);
});
