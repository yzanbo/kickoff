import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_HUES } from "@shared/project/colors";
import { makeGroup } from "@shared/testing/factories";
import type { GitWorktree } from "@shared/types";
import type { BucketHead } from "./buckets";
import { bucketHueOf, bucketHuesOf, projectBucketHues, spreadHues } from "./bucketHues";
import { workplaceHue } from "@/features/worktree/workplaceHue";

const head = (key: string, kind: BucketHead["kind"], extra: Partial<BucketHead> = {}): BucketHead => ({ key, kind, label: key, projectId: 1, ...extra });
const worktree = (path: string, patch: Partial<GitWorktree> = {}): GitWorktree => ({ path, root: path, branch: path, head: "abc", main: false, locked: false, prunable: false, ...patch });

test("まとまりの色: グループ別は自分で作ったグループの覚えた色を、グループの並びで先に取る（被ったものは空いている色へ）", () => {
  const [a, b] = PROJECT_HUES;
  const groups = [makeGroup(1, { hue: a }), makeGroup(2, { hue: b }), makeGroup(3, { hue: a })];
  const hues = projectBucketHues("group", 5, { groupsOf: () => groups });
  assert.equal(hues.get("p5/g1"), a);
  assert.equal(hues.get("p5/g2"), b);
  assert.notEqual(hues.get("p5/g3"), a);
  // 固定・グループなし・アーカイブ済みも色を持ち、グループとも互いにも被らない
  const all = ["p5/g1", "p5/g2", "p5/g3", "p5/pinned", "p5/ungrouped", "p5/archived"].map((k) => hues.get(k));
  assert.equal(new Set(all).size, all.length);
});

test("まとまりの色: 画面に出ているまとまりではなく、プロジェクトのまとまりすべてから決める（サイドバーとタブの列で同じ色）", () => {
  const groups = [makeGroup(1, { hue: PROJECT_HUES[0] }), makeGroup(2, { hue: PROJECT_HUES[3] })];
  const hues = projectBucketHues("group", 5, { groupsOf: () => groups });
  // どのまとまりを並べても、同じキーは同じ色（グループの見出しの色は覚えた色）
  assert.equal(bucketHueOf(head("p5/pinned", "pinned"), hues), hues.get("p5/pinned"));
  assert.equal(bucketHueOf(head("p5/g2", "group", { group: groups[1] }), hues), PROJECT_HUES[3]);
  // 何度決め直しても同じ
  assert.deepEqual([...projectBucketHues("group", 5, { groupsOf: () => groups })], [...hues]);
});

test("まとまりの色: 作業場所別は、いまある作業場所をブランチの印と同じ色にし、固定・アーカイブ済みはそれと被らない色", () => {
  const list = [worktree("/repo", { main: true, branch: "main" }), worktree("/wt/a"), worktree("/wt/b"), worktree("/wt/gone", { prunable: true })];
  const hues = projectBucketHues("worktree", 5, { worktreesOf: () => list });
  assert.equal(hues.get("p5/w:main"), workplaceHue(5, { key: "" }, list));
  assert.equal(hues.get("p5/w:/wt/a"), workplaceHue(5, { key: "/wt/a" }, list));
  assert.equal(hues.has("p5/w:/wt/gone"), false);
  const all = ["p5/w:main", "p5/w:/wt/a", "p5/w:/wt/b", "p5/pinned", "p5/archived"].map((k) => hues.get(k));
  assert.equal(new Set(all).size, all.length);
  // 一覧にない作業場所（フォルダなし・以前のブランチ）は、見出しが持つ作業場所の色
  assert.equal(bucketHueOf(head("p5/w:branch:old", "worktree", { hue: 135 }), hues), 135);
});

test("まとまりの色: 「その他」・状態・まとめないまとまりは色を付けない。プロジェクトどうしは別々に決める", () => {
  const hues = bucketHuesOf("group", [1, 2], { groupsOf: () => [] });
  assert.equal(bucketHueOf(head("other", "other"), hues), null);
  assert.equal(bucketHueOf(head("p1/status:running", "status"), hues), null);
  assert.equal(bucketHueOf(head("p1/all", "all"), hues), null);
  assert.equal(hues.has("p1/pinned") && hues.has("p2/pinned"), true);
});

test("まとまりの色: 好みの色が被ったら空いている色へ。10 色を使い切ったら被ってよい", () => {
  const hues = spreadHues(Array.from({ length: 12 }, (_, i) => [`k${i}`, PROJECT_HUES[0]] as const));
  assert.equal(hues.get("k0"), PROJECT_HUES[0]);
  assert.equal(new Set([...hues.values()].slice(0, 10)).size, 10);
  assert.equal(hues.size, 12);
});
