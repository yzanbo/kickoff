import assert from "node:assert/strict";
import { test } from "node:test";
import { nextActiveTab } from "./panelTabs";

const tabs = [{ key: "a" }, { key: "b" }, { key: "c" }];

test("nextActiveTab: 表示中のタブを閉じたら、同じ位置に来たタブ（最後なら 1 つ前）", () => {
  assert.equal(nextActiveTab(tabs, "b", "b"), "c");
  assert.equal(nextActiveTab(tabs, "c", "c"), "b");
  assert.equal(nextActiveTab(tabs, "a", "a"), "b");
});

test("nextActiveTab: ほかのタブを閉じたなら表示中のまま。最後の 1 つを閉じたら null", () => {
  assert.equal(nextActiveTab(tabs, "a", "c"), "c");
  assert.equal(nextActiveTab(tabs, "b", null), null);
  assert.equal(nextActiveTab([{ key: "a" }], "a", "a"), null);
  // 一覧にないキーでも落ちない
  assert.equal(nextActiveTab(tabs, "zzz", "zzz"), null);
});
