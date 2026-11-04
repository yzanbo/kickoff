import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_HUES } from "@shared/project/colors";
import type { ChatGroup } from "@shared/types";
import type { BucketHead } from "@/features/chatList/buckets";
import { OTHER_CLUSTER, clusterHue, clusterHues, clusterTabs, paneIndexOf, visibleClusterTabs } from "./tabClusters";

const group = (id: number, position: number, hue = 0): ChatGroup => ({ id, project_id: 1, name: `G${id}`, position, hue, created_at: "" });
const head = (key: string, kind: BucketHead["kind"], extra: Partial<BucketHead> = {}): BucketHead => ({ key, kind, label: key, projectId: 1, ...extra });

test("タブのまとめ方: 同じ並びのまとまり（作業場所）は初めて出てくる順、その他はいちばん後ろ。まとまりの中はペインの並びのまま", () => {
  const heads: Record<string, BucketHead> = { a: head("p1/w:x", "worktree"), b: OTHER_CLUSTER, c: head("p1/w:y", "worktree"), d: head("p1/w:x", "worktree"), e: head("p1/w:y", "worktree") };
  const clusters = clusterTabs(["a", "b", "c", "d", "e"], (k) => heads[k]);
  assert.deepEqual(
    clusters.map((c) => [c.key, c.tabs]),
    [
      ["p1/w:x", ["a", "d"]],
      ["p1/w:y", ["c", "e"]],
      ["other", ["b"]],
    ],
  );
  assert.deepEqual(clusterTabs([], () => OTHER_CLUSTER), []);
});

test("タブのまとめ方: グループはサイドバーの並びで、seeds（自分で作ったグループ）はタブがなくても札だけ出す。グループなしはグループのあと", () => {
  const g1 = head("p1/g1", "group", { group: group(1, 2) });
  const g2 = head("p1/g2", "group", { group: group(2, 1) });
  const g3 = head("p1/g3", "group", { group: group(3, 3) });
  const heads: Record<string, BucketHead> = { a: g2, b: head("p1/ungrouped", "ungrouped"), c: g1 };
  const clusters = clusterTabs(["a", "b", "c"], (k) => heads[k], [g1, g3, g2]);
  assert.deepEqual(
    clusters.map((c) => [c.key, c.tabs]),
    [
      ["p1/g2", ["a"]],
      ["p1/g1", ["c"]],
      ["p1/g3", []],
      ["p1/ungrouped", ["b"]],
    ],
  );
});

test("タブのまとめ方: 固定はいちばん前、アーカイブ済みはほかのまとまりのあと・その他の前。プロジェクトは渡した順", () => {
  const heads: Record<string, BucketHead> = {
    a: head("p1/archived", "archived"),
    b: OTHER_CLUSTER,
    c: head("p1/w:main", "worktree"),
    d: head("p1/pinned", "pinned"),
    e: head("p2/w:main", "worktree", { projectId: 2 }),
  };
  const clusters = clusterTabs(["a", "b", "c", "d", "e"], (k) => heads[k], [], [2, 1]);
  assert.deepEqual(
    clusters.map((c) => c.key),
    ["p2/w:main", "p1/pinned", "p1/w:main", "p1/archived", "other"],
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
  assert.equal(clusterHue(head("p5/w:main", "worktree")), clusterHue(head("p5/w:main", "worktree")));
  assert.equal(typeof clusterHue(head("p5/w:main", "worktree")), "number");
  assert.equal(clusterHue(head("p5/g7", "group", { group: group(7, 0, 262) })), 262);
  assert.equal(clusterHue(OTHER_CLUSTER), null);
});

test("タブのまとめ方: 同じ列のまとまりの色は被らない（グループの覚えた色を先に取り、被ったものは空いている色へ）", () => {
  // キーから決まる色がグループの色と同じになるまとまりを作る（もう 1 つのグループはそれとは別の色）
  const fixed = clusterHue(head("p5/pinned", "pinned"))!;
  const other = PROJECT_HUES.find((h) => h !== fixed)!;
  const hues = clusterHues([head("p5/pinned", "pinned"), head("p5/g1", "group", { group: group(1, 0, fixed) }), head("p5/g2", "group", { group: group(2, 1, other) }), OTHER_CLUSTER]);
  assert.equal(hues.get("p5/g1"), fixed);
  assert.equal(hues.get("p5/g2"), other);
  assert.notEqual(hues.get("p5/pinned"), fixed);
  assert.notEqual(hues.get("p5/pinned"), other);
  assert.equal(hues.get(OTHER_CLUSTER.key), null);
  // 10 色より多くても、すべてに色が付く（使い切ったら被ってよい）
  const many = clusterHues(Array.from({ length: 12 }, (_, i) => head(`k${i}`, "worktree")));
  assert.equal(new Set([...many.values()].slice(0, 10)).size, 10);
  assert.equal(many.size, 12);
});

test("タブのまとめ方: 畳んだまとまりは、ペインで表示中のタブだけを残す", () => {
  const cluster = { ...head("p1/g2", "group"), tabs: ["a", "b", "c"] };
  assert.deepEqual(visibleClusterTabs(cluster, false, "b"), ["a", "b", "c"]);
  assert.deepEqual(visibleClusterTabs(cluster, true, "b"), ["b"]);
  // 表示中のタブがほかのまとまりにあれば、すべて隠す
  assert.deepEqual(visibleClusterTabs(cluster, true, "x"), []);
  assert.deepEqual(visibleClusterTabs(cluster, true, null), []);
});
