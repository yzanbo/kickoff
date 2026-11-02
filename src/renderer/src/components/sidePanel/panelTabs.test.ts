import assert from "node:assert/strict";
import { test } from "node:test";
import { closeTabs, nextActiveTab } from "./panelTabs";

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

test("closeTabs: いくつか続けて閉じても、1 つずつ閉じたのと同じ結果", () => {
  assert.deepEqual(closeTabs(tabs, ["b", "c"], "b"), { tabs: [{ key: "a" }], activeTab: "a" });
  assert.deepEqual(closeTabs(tabs, ["a", "b", "c"], "a"), { tabs: [], activeTab: null });
  assert.deepEqual(closeTabs(tabs, ["a"], "c"), { tabs: [{ key: "b" }, { key: "c" }], activeTab: "c" });
  assert.deepEqual(closeTabs(tabs, [], "c"), { tabs, activeTab: "c" });
});
