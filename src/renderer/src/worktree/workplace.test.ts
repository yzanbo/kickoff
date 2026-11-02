import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitWorktree } from "../../../core/types";
import { compareWorkplaces, workplaceOf } from "./workplace";

const wt = (path: string, branch: string | null, extra: Partial<GitWorktree> = {}): GitWorktree => ({
  path,
  branch,
  head: "a1b2c3d4e5f6",
  main: false,
  locked: false,
  prunable: false,
  ...extra,
});
const list = [wt("/repo", "main", { main: true }), wt("/repo-worktrees/feat-a", "feat/a"), wt("/repo-worktrees/gone", "feat/gone", { prunable: true })];

test("作業場所: 本体・ワークツリーは、いまのブランチ名で出す", () => {
  assert.deepEqual(
    { ...workplaceOf({ worktree_path: "", branch: "" }, list), title: undefined },
    { key: "", kind: "main", name: "main", title: undefined },
  );
  const a = workplaceOf({ worktree_path: "/repo-worktrees/feat-a", branch: "feat/a" }, list);
  assert.equal(a.kind, "worktree");
  assert.equal(a.name, "feat/a");
  assert.equal(a.key, "/repo-worktrees/feat-a");
  // 名前を変えたブランチは、いまの名前で出す（作業場所は同じ）
  assert.equal(workplaceOf({ worktree_path: "/repo-worktrees/feat-a", branch: "old-name" }, list).name, "feat/a");
});

test("作業場所: ブランチから外れていれば HEAD とコミット", () => {
  const detached = [wt("/repo", null, { main: true })];
  assert.equal(workplaceOf({ worktree_path: "", branch: "" }, detached).name, "HEAD a1b2c3d");
});

test("作業場所: フォルダが消えたワークツリー（Git に記録が残る・残らない）はフォルダなし", () => {
  const prunable = workplaceOf({ worktree_path: "/repo-worktrees/gone", branch: "" }, list);
  assert.equal(prunable.kind, "missing");
  assert.equal(prunable.name, "feat/gone");
  // 記録も消えていれば、最後に作業したブランチ → フォルダ名の順で出す
  assert.equal(workplaceOf({ worktree_path: "/repo-worktrees/feat-x", branch: "feat/x" }, list).name, "feat/x");
  assert.equal(workplaceOf({ worktree_path: "/repo-worktrees/feat-x", branch: "feat/x" }, list).kind, "missing");
  assert.equal(workplaceOf({ worktree_path: "/repo-worktrees/feat-x", branch: "" }, list).name, "feat-x");
});

test("作業場所: 片付けて本体に戻ったチャットは、最後に作業したブランチでまとめる（本体の作業と混ぜない）", () => {
  const past = workplaceOf({ worktree_path: "", branch: "feat/done" }, list);
  assert.equal(past.kind, "past");
  assert.equal(past.name, "feat/done");
  assert.equal(past.key, "branch:feat/done");
  // 本体と同じブランチなら本体
  assert.equal(workplaceOf({ worktree_path: "", branch: "main" }, list).kind, "main");
});

test("作業場所: 一覧を読み込むまでは、最後に作業したブランチ → フォルダ名で仮に出す（フォルダなしにはしない）", () => {
  assert.deepEqual(
    { ...workplaceOf({ worktree_path: "/repo-worktrees/feat-a", branch: "feat/a" }, undefined), title: undefined },
    { key: "/repo-worktrees/feat-a", kind: "worktree", name: "feat/a", title: undefined },
  );
  assert.equal(workplaceOf({ worktree_path: "", branch: "feat/done" }, undefined).kind, "main");
  // Git でない本体: 名前なし（印は出さない）
  assert.equal(workplaceOf({ worktree_path: "", branch: "" }, []).name, "");
});

test("作業場所の並び: 本体 → ワークツリー（名前順）→ フォルダなし → 以前のブランチ", () => {
  const places = [
    workplaceOf({ worktree_path: "", branch: "feat/done" }, list),
    workplaceOf({ worktree_path: "/repo-worktrees/gone", branch: "" }, list),
    workplaceOf({ worktree_path: "/repo-worktrees/feat-a", branch: "" }, list),
    workplaceOf({ worktree_path: "", branch: "" }, list),
  ];
  assert.deepEqual(places.sort(compareWorkplaces).map((p) => p.kind), ["main", "worktree", "missing", "past"]);
});
