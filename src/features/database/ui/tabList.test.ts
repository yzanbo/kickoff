import assert from "node:assert/strict";
import { test } from "vitest";
import { closeTab, keepTab, moveTab, openTab, pinTab, type TabItem, type TabListState } from "./tabList";

const state = (keys: string[], active: string | null = keys[0] ?? null): TabListState<TabItem> => ({ tabs: keys.map((key) => ({ key })), active });
const keys = (s: TabListState<TabItem>) => s.tabs.map((t) => `${t.key}${t.preview ? "?" : ""}${t.pinned ? "!" : ""}`);

test("openTab: 表示中のタブの右に足して表示し、同じキーがあれば選ぶだけ", () => {
  const opened = openTab(state(["a", "b"], "a"), { key: "c" });
  assert.deepEqual(keys(opened), ["a", "c", "b"]);
  assert.equal(opened.active, "c");
  const again = openTab(opened, { key: "b" });
  assert.deepEqual(keys(again), ["a", "c", "b"]);
  assert.equal(again.active, "b");
  // after: null は最後に足す
  assert.deepEqual(keys(openTab(state(["a", "b"], "a"), { key: "c" }, { after: null })), ["a", "b", "c"]);
});

test("openTab: 仮のタブは前の仮のタブを同じ場所で置き換え、仮でなく開き直したら固定する", () => {
  const first = openTab(state(["a", "b"], "a"), { key: "p" }, { preview: true });
  assert.deepEqual(keys(first), ["a", "p?", "b"]);
  const second = openTab({ ...first, active: "b" }, { key: "q" }, { preview: true });
  assert.deepEqual(keys(second), ["a", "q?", "b"]);
  assert.equal(second.active, "q");
  assert.deepEqual(keys(openTab(second, { key: "q" }, { preview: true })), ["a", "q?", "b"]);
  assert.deepEqual(keys(openTab(second, { key: "q" })), ["a", "q", "b"]);
});

test("closeTab: 表示中を閉じたら右隣、なければ左隣を表示する", () => {
  assert.equal(closeTab(state(["a", "b", "c"], "b"), "b").active, "c");
  assert.equal(closeTab(state(["a", "b", "c"], "c"), "c").active, "b");
  assert.equal(closeTab(state(["a", "b"], "a"), "b").active, "a");
  assert.equal(closeTab(state(["a"], "a"), "a").active, null);
  const s = state(["a"]);
  assert.equal(closeTab(s, "x"), s);
});

test("pinTab・keepTab: 固定すると仮でなくなり、変わらなければ同じ状態を返す", () => {
  const preview = openTab(state(["a"]), { key: "p" }, { preview: true });
  assert.deepEqual(keys(pinTab(preview, "p", true)), ["a", "p!"]);
  assert.deepEqual(keys(pinTab(pinTab(preview, "p", true), "p", false)), ["a", "p"]);
  assert.deepEqual(keys(keepTab(preview, "p")), ["a", "p"]);
  const plain = state(["a"]);
  assert.equal(keepTab(plain, "a"), plain);
  assert.equal(pinTab(plain, "a", false), plain);
});

test("moveTab: target の前・後ろへ動かし、動かなければ同じ状態を返す", () => {
  assert.deepEqual(keys(moveTab(state(["a", "b", "c"]), "a", "c", "after")), ["b", "c", "a"]);
  assert.deepEqual(keys(moveTab(state(["a", "b", "c"]), "c", "a", "before")), ["c", "a", "b"]);
  const s = state(["a", "b"]);
  assert.equal(moveTab(s, "a", "b", "before"), s);
  assert.equal(moveTab(s, "a", "a", "after"), s);
});
