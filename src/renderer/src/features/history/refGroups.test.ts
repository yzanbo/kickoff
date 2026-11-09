import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitRefs, GitWorktree } from "@shared/types";
import { groupBranches } from "./refGroups";

const branch = (name: string, current = false): GitRefs["branches"][number] => ({ name, hash: name, current, upstream: null, ahead: 0, behind: 0, worktree: null });
const tree = (path: string, b: string | null, main = false): GitWorktree => ({ path, root: path, branch: b, head: "h", main, locked: false, prunable: false });

test("groupBranches: 本体で取り出しているブランチを先頭に、ワークツリーで取り出しているブランチはワークツリーの行へ分ける", () => {
  const branches = [branch("a"), branch("feature/x"), branch("main", true), branch("topic")];
  const worktrees = [tree("/repo", "main", true), tree("/repo-worktrees/feature-x", "feature/x"), tree("/repo-worktrees/detached", null)];
  const all = groupBranches(branches, worktrees, () => true);
  assert.deepEqual(all.main.map((b) => b.name), ["main", "a", "topic"]);
  assert.deepEqual(
    all.worktrees.map((r) => [r.worktree.path, r.branch?.name]),
    [
      ["/repo-worktrees/feature-x", "feature/x"],
      ["/repo-worktrees/detached", undefined],
    ],
  );
  // 絞り込み（ワークツリーはブランチ名、ブランチがなければフォルダで）
  const filtered = groupBranches(branches, worktrees, (name) => name.includes("x"));
  assert.deepEqual(filtered.main.map((b) => b.name), []);
  assert.deepEqual(filtered.worktrees.map((r) => r.worktree.path), ["/repo-worktrees/feature-x"]);
  // ワークツリーの一覧がまだなければ、すべて本体に
  assert.deepEqual(groupBranches(branches, [], () => true).main.map((b) => b.name), ["a", "feature/x", "main", "topic"]);
});
