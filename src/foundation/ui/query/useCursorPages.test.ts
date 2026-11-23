import assert from "node:assert/strict";
import { test } from "vitest";
import { appendPage, moreApplies } from "./useCursorPages";

test("appendPage: 続きの分を後ろに足し（すでにある行は除く）、cursor は続きの分のものにする", () => {
  const page = { items: [{ n: 1 }, { n: 2 }], cursor: "c2", total: 3 };
  const merged = appendPage(page, { items: [{ n: 2 }, { n: 3 }], cursor: null }, (a, b) => a.n === b.n);
  assert.deepEqual(merged, { items: [{ n: 1 }, { n: 2 }, { n: 3 }], cursor: null, total: 3 });
});

test("moreApplies: 続きを読んでいる途中に絞り込みを変えた・取り直したら、続きの答えは捨てる", () => {
  const base = { items: [], cursor: "c2" };
  assert.equal(moreApplies(base, { data: base, loading: false }), true);
  // 絞り込みを変えた（前の一覧を出したまま 1 ページ目を取りに行っている）・取り直している
  assert.equal(moreApplies(base, { data: base, loading: true }), false);
  // 1 ページ目が置き換わった
  assert.equal(moreApplies(base, { data: { items: [], cursor: "c2" }, loading: false }), false);
});
