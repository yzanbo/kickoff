import assert from "node:assert/strict";
import { test } from "vitest";
import { collectTags, MAX_TAG_LENGTH, MAX_TAGS, matchesTags, normalizeTags, orderTags, removeTagFrom, renameTagIn, UNTAGGED, validateTagAdd } from "./tags";

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

test("orderTags: 並べた順に並べ、並べていないタグは後ろに名前順のまま（もうないタグは無視する）", () => {
  assert.deepEqual(orderTags(["仕事", "個人", "趣味"], ["趣味", "消したタグ", "仕事"]), ["趣味", "仕事", "個人"]);
  assert.deepEqual(orderTags(["a", "b"], []), ["a", "b"]);
});

test("renameTagIn / removeTagFrom: 名前を変えても位置はそのまま。もう付いている名前なら 1 つにまとめる", () => {
  assert.deepEqual(renameTagIn(["a", "b", "c"], "b", "B"), ["a", "B", "c"]);
  assert.deepEqual(renameTagIn(["a", "b", "c"], "c", "a"), ["a", "b"]);
  assert.deepEqual(renameTagIn(["a"], "x", "y"), ["a"]);
  assert.deepEqual(removeTagFrom(["a", "b"], "a"), ["b"]);
});

test("validateTagAdd: 空白・重複を除いて足し、長すぎるタグ・数の上限を超えるなら足さない", () => {
  assert.deepEqual(validateTagAdd(["仕事"], [" 趣味 ", "仕事", ""]), { ok: true, tags: ["仕事", "趣味"] });
  const long = "あ".repeat(MAX_TAG_LENGTH + 1);
  assert.deepEqual(validateTagAdd([], ["短い", long]), { ok: false, reason: "too_long", tag: long });
  const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
  assert.deepEqual(validateTagAdd(full, ["t0"]), { ok: true, tags: full });
  assert.deepEqual(validateTagAdd(full, ["new"]), { ok: false, reason: "too_many" });
});
