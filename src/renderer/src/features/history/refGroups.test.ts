import assert from "node:assert/strict";
import { test } from "vitest";
import type { GitRefs } from "@shared/types";
import { makeWorktree } from "@shared/testing/factories";
import { groupBranches } from "./refGroups";

const branch = (name: string, current = false): GitRefs["branches"][number] => ({ name, hash: name, current, upstream: null, ahead: 0, behind: 0, worktree: null });

test("groupBranches: 本体で取り出しているブランチを先頭に、ワークツリーで取り出しているブランチはワークツリーの行へ分ける", () => {
  const branches = [branch("a"), branch("feature/x"), branch("main", true), branch("topic")];
  const worktrees = [makeWorktree("/repo", { branch: "main", main: true }), makeWorktree("/repo-worktrees/feature-x", { branch: "feature/x" }), makeWorktree("/repo-worktrees/detached", { branch: null })];
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
