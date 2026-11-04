import assert from "node:assert/strict";
import { test } from "node:test";
import { OTHER_CLUSTER, clusterTabs, paneIndexOf } from "./tabClusters.js";

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
