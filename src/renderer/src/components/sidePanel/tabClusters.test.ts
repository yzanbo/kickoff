import assert from "node:assert/strict";
import { test } from "node:test";
import { OTHER_CLUSTER, clusterHue, clusterHues, clusterTabs, isClusterCollapsed, paneIndexOf, toggleClusterCollapsed, visibleClusterTabs } from "./tabClusters.js";

test("タブのまとめ方: 初めて出てくる順にまとめ、その他はいちばん後ろ。まとまりの中はペインの並びのまま", () => {
  const of: Record<string, string> = { a: "g1", b: "other", c: "g2", d: "g1", e: "g2" };
  const clusters = clusterTabs(["a", "b", "c", "d", "e"], (k) => (of[k] === "other" ? OTHER_CLUSTER : { key: of[k], label: of[k] }));
  assert.deepEqual(
    clusters.map((c) => [c.key, c.tabs]),
    [
      ["g1", ["a", "d"]],
      ["g2", ["c", "e"]],
      ["other", ["b"]],
    ],
  );
  assert.deepEqual(clusterTabs([], () => OTHER_CLUSTER), []);
});

test("タブのまとめ方: 先に並べるまとまり（サイドバーのグループの並び）を先に出し、keepEmpty ならタブがなくても札だけ出す", () => {
  const of: Record<string, string> = { a: "g2", b: "none", c: "g1" };
  const order = [
    { cluster: { key: "g1", label: "g1" }, keepEmpty: true },
    { cluster: { key: "g3", label: "g3" }, keepEmpty: true },
    { cluster: { key: "g2", label: "g2" }, keepEmpty: true },
    { cluster: { key: "none", label: "グループなし" }, keepEmpty: false },
    { cluster: { key: "empty-none", label: "グループなし" }, keepEmpty: false },
  ];
  const clusters = clusterTabs(["a", "b", "c"], (k) => ({ key: of[k], label: of[k] }), order);
  assert.deepEqual(
    clusters.map((c) => [c.key, c.tabs]),
    [
      ["g1", ["c"]],
      ["g3", []],
      ["g2", ["a"]],
      ["none", ["b"]],
    ],
  );
});

test("タブのまとめ方: 見た目の並びで落とす位置を、ペインの並びの位置に直す", () => {
  const pane = ["a", "b", "c", "d"];
  const display = ["a", "d", "b", "c"];
  assert.equal(paneIndexOf(0, display, pane), 0);
  // 見た目で 2 番目（d）の前 = ペインでは d の位置
  assert.equal(paneIndexOf(1, display, pane), 3);
  assert.equal(paneIndexOf(2, display, pane), 1);
  // いちばん後ろ
  assert.equal(paneIndexOf(4, display, pane), 4);
});

test("タブのまとめ方: まとまりの色は、グループなら覚えた色、ほかはキーから決まり（いつも同じ）、その他は色なし", () => {
  assert.equal(clusterHue({ key: "p5:w1" }), clusterHue({ key: "p5:w1" }));
  assert.equal(typeof clusterHue({ key: "p5:w1" }), "number");
  assert.equal(clusterHue({ key: "p5:g7", hue: 262 }), 262);
  assert.equal(clusterHue(OTHER_CLUSTER), null);
});

test("タブのまとめ方: 同じ列のまとまりの色は被らない（グループの覚えた色を先に取り、被ったものは空いている色へ）", () => {
  // キーから決まる色がグループの色と同じになるまとまりを作る
  const fixed = clusterHue({ key: "p5:pinned" })!;
  const hues = clusterHues([{ key: "p5:pinned" }, { key: "p5:g1", hue: fixed }, { key: "p5:g2", hue: 0 }, OTHER_CLUSTER]);
  assert.equal(hues.get("p5:g1"), fixed);
  assert.equal(hues.get("p5:g2"), 0);
  assert.notEqual(hues.get("p5:pinned"), fixed);
  assert.notEqual(hues.get("p5:pinned"), 0);
  assert.equal(hues.get(OTHER_CLUSTER.key), null);
  // 10 色より多くても、すべてに色が付く（使い切ったら被ってよい）
  const many = clusterHues(Array.from({ length: 12 }, (_, i) => ({ key: `k${i}` })));
  assert.equal(new Set([...many.values()].slice(0, 10)).size, 10);
  assert.equal(many.size, 12);
});

test("タブのまとめ方: 畳んだまとまりは、ペインで表示中のタブだけを残す", () => {
  const cluster = { key: "p1:g2", label: "レビュー", tabs: ["a", "b", "c"] };
  assert.deepEqual(visibleClusterTabs(cluster, false, "b"), ["a", "b", "c"]);
  assert.deepEqual(visibleClusterTabs(cluster, true, "b"), ["b"]);
  // 表示中のタブがほかのまとまりにあれば、すべて隠す
  assert.deepEqual(visibleClusterTabs(cluster, true, "x"), []);
  assert.deepEqual(visibleClusterTabs(cluster, true, null), []);
});

test("タブのまとめ方: tail のまとまり（アーカイブ済み）は、ほかのまとまりのあと・その他の前に置く", () => {
  const of: Record<string, string> = { a: "archived", b: "other", c: "w1", d: "pinned" };
  const order = [
    { cluster: { key: "pinned", label: "固定" }, keepEmpty: false },
    { cluster: { key: "archived", label: "アーカイブ済み" }, keepEmpty: false, tail: true },
  ];
  const clusters = clusterTabs(["a", "b", "c", "d"], (k) => (of[k] === "other" ? OTHER_CLUSTER : { key: of[k], label: of[k] }), order);
  assert.deepEqual(
    clusters.map((c) => c.key),
    ["pinned", "w1", "archived", "other"],
  );
  // タブのない tail のまとまりは出さない
  assert.deepEqual(
    clusterTabs(["c"], (k) => ({ key: of[k], label: of[k] }), order).map((c) => c.key),
    ["w1"],
  );
});

test("タブのまとまりの畳み: アーカイブ済みは初めは畳み、開いたら open: で覚える。ほかは畳んだときだけ覚える", () => {
  assert.equal(isClusterCollapsed("p1:archived", []), true);
  assert.equal(isClusterCollapsed("p1:g2", []), false);
  const opened = toggleClusterCollapsed("p1:archived", []);
  assert.deepEqual(opened, ["open:p1:archived"]);
  assert.equal(isClusterCollapsed("p1:archived", opened), false);
  assert.deepEqual(toggleClusterCollapsed("p1:archived", opened), []);
  assert.deepEqual(toggleClusterCollapsed("p1:g2", []), ["p1:g2"]);
});
