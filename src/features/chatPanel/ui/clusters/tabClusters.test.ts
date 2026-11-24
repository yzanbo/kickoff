import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { makeGroup } from "@shared/groups/testing";
import { browserTab, chatTab, newChatTab, terminalTab, type PanelTab } from "@/features/panel/ui";
import { OTHER_CLUSTER, clusterInitial, tabClusterOf, type ClusterResolver, clusterTabs, orderLikeSidebar, paneIndexOf, shownClusters, visibleClusterTabs } from "./tabClusters";
import type { BucketHead } from "@/features/chatList/ui";

const group = (id: number, position: number, hue = 0) => makeGroup(id, { position, hue });
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

test("タブのまとめ方: 畳んだまとまりは、ペインで表示中のタブだけを残す", () => {
  const cluster = { ...head("p1/g2", "group"), tabs: ["a", "b", "c"] };
  assert.deepEqual(visibleClusterTabs(cluster, false, "b"), ["a", "b", "c"]);
  assert.deepEqual(visibleClusterTabs(cluster, true, "b"), ["b"]);
  // 表示中のタブがほかのまとまりにあれば、すべて隠す
  assert.deepEqual(visibleClusterTabs(cluster, true, "x"), []);
  assert.deepEqual(visibleClusterTabs(cluster, true, null), []);
});

test("タブのまとめ方: 隠したグループと、チャットもタブもないグループ（hideEmpty）を外す。表示中のタブがある隠したグループは畳んで残す", () => {
  const g1 = { ...head("p1/g1", "group", { group: group(1, 1) }), tabs: ["a"] };
  const g2 = { ...head("p1/g2", "group", { group: group(2, 2) }), tabs: ["b"] };
  const g3 = { ...head("p1/g3", "group", { group: group(3, 3) }), tabs: [] };
  const g4 = { ...head("p1/g4", "group", { group: group(4, 4) }), tabs: [] };
  const none = { ...head("p1/ungrouped", "ungrouped"), tabs: [] };
  const counts: Record<string, number> = { "p1/g3": 0, "p1/g4": 2, "p1/ungrouped": 0 };
  const countOf = (c: { key: string }) => counts[c.key] ?? 1;
  const all = [g1, g2, g3, g4, none];
  // 隠すものがなければそのまま
  assert.deepEqual(shownClusters(all, { hiddenGroups: new Set(), hideEmpty: false, countOf, active: null }).clusters.map((c) => c.key), all.map((c) => c.key));
  // g1 を隠す（表示中のタブがなければ外す）・チャットのない g3 を外す（チャットのある g4、グループなしは残す）
  const hidden = shownClusters(all, { hiddenGroups: new Set([1]), hideEmpty: true, countOf, active: "b" });
  assert.deepEqual(hidden.clusters.map((c) => c.key), ["p1/g2", "p1/g4", "p1/ungrouped"]);
  assert.deepEqual([...hidden.forced], []);
  // 隠した g1 のタブを表示中なら、畳んだ形で残す
  const forced = shownClusters(all, { hiddenGroups: new Set([1]), hideEmpty: false, countOf, active: "a" });
  assert.deepEqual(forced.clusters.map((c) => c.key), ["p1/g1", "p1/g2", "p1/g3", "p1/g4", "p1/ungrouped"]);
  assert.deepEqual([...forced.forced], ["p1/g1"]);
});

test("orderLikeSidebar: チャットのタブだけサイドバーの並びにし、ほかのタブの位置は変えない。並びにないチャットは後ろに今の順のまま", () => {
  const ids: Record<string, number> = { c1: 1, c2: 2, c3: 3, c9: 9, c8: 8 };
  const chatIdOf = (k: string) => ids[k] ?? null;
  const order = new Map([
    [3, 0],
    [1, 1],
    [2, 2],
  ]);
  assert.deepEqual(orderLikeSidebar(["c1", "new", "c2", "c9", "c3", "c8", "web"], chatIdOf, order), ["c3", "new", "c1", "c2", "c9", "c8", "web"]);
  // 変わらなければ同じ配列
  const same = ["c3", "new", "c1"];
  assert.equal(orderLikeSidebar(same, chatIdOf, order), same);
});

test("まとまりの名前を省略: グループ名・本体・ブランチ名の頭の 1 文字。プロジェクト名を添えた札でもプロジェクト名は使わない。絵文字は切らない", () => {
  const group: BucketHead = { key: "g", kind: "group", label: "Kickoff · 開発", group: makeGroup(1, { name: "開発" }), projectId: 1 };
  assert.equal(clusterInitial(group), "開");
  const main: BucketHead = { key: "m", kind: "worktree", label: "本体 · main", place: { key: "", kind: "main", name: "main", title: "" } };
  assert.equal(clusterInitial(main), "本");
  const wt: BucketHead = { key: "w", kind: "worktree", label: "feature/x", place: { key: "/p", kind: "worktree", name: "feature/x", title: "" } };
  assert.equal(clusterInitial(wt), "f");
  assert.equal(clusterInitial({ key: "p", kind: "pinned", label: "Kickoff · 固定" }), "固");
  assert.equal(clusterInitial({ key: "e", kind: "group", label: "x", group: makeGroup(2, { name: "🚀 リリース" }) }), "🚀");
});

const tabHead = (key: string): BucketHead => ({ key, kind: "group", label: key });

test("まとまり: チャットはチャットの（分からなければ作成先の）、新しいチャットは作成先の、ターミナルはフォルダの、ブラウザはその他", () => {
  const resolve: ClusterResolver = {
    chatById: (id) => (id === 1 ? makeChat(1) : undefined),
    draftOf: (key) => drafts[key],
    ofChat: (c) => tabHead(`chat:${c.id}`),
    ofTarget: (projectId, group, worktree) => tabHead(`target:${projectId}:${group ?? ""}${worktree ? `:${worktree}` : ""}`),
    ofFolder: (projectId, cwd) => tabHead(`folder:${projectId}:${cwd}`),
  };
  const drafts: Record<string, { projectId: number; group?: number; worktree?: string }> = { "new:g": { projectId: 2, group: 4 }, "new:w": { projectId: 2, worktree: "/repo/a-wt" } };
  const of = (t: PanelTab) => tabClusterOf(t, resolve).key;
  assert.equal(of(chatTab(makeChat(1))), "chat:1");
  assert.equal(of(chatTab(makeChat(9))), "target:1:");
  assert.equal(of(newChatTab("new:g")), "target:2:4");
  // 作業場所別のまとまりの「新しいチャット」から始めたものは、そのワークツリーのまとまり
  assert.equal(of(newChatTab("new:w")), "target:2::/repo/a-wt");
  // 下書きが見つからないものはその他
  assert.equal(tabClusterOf(newChatTab("new:x"), resolve), OTHER_CLUSTER);
  assert.equal(of(terminalTab({ cwd: "/repo/a", label: "a", projectId: 3 })), "folder:3:/repo/a");
  assert.equal(tabClusterOf(browserTab(), resolve), OTHER_CLUSTER);
});
