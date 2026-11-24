// ワークツリーの PR の知らせの組み立て（純粋な関数）と、見張るプロジェクトの選び方
import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import type { GitWorktree } from "@shared/foundation/workplace";
import { makeWorktree } from "@shared/foundation/testing/data";
import type { BranchPullRequest } from "./pulls";
import { noticesFor, WorktreePrWatch } from "./prWatch";

const worktree = (branch: string | null, extra: Partial<GitWorktree> = {}) => makeWorktree(`/w/${branch}`, { branch, head: "abc", ...extra });
const pr = (number: number, branch: string, state: BranchPullRequest["state"], owner = "me"): BranchPullRequest => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  state,
  branch,
  head_owner: owner,
});

test("知らせ: ブランチごとのいちばん新しい PR がマージ済み・閉じたなら知らせ、開いていれば知らせない（本体・ブランチのないもの・fork からの同じ名前の PR は見ない）", () => {
  const worktrees = [worktree("main", { main: true }), worktree("feat/a"), worktree("feat/b"), worktree("feat/c"), worktree("feat/d"), worktree(null)];
  const prs = [
    pr(1, "main", "MERGED"),
    pr(2, "feat/a", "MERGED"),
    // 閉じたあと開き直した（新しい PR が開いている）なら知らせない
    pr(3, "feat/b", "CLOSED"),
    pr(4, "feat/b", "OPEN"),
    pr(5, "feat/c", "CLOSED"),
    // fork からの同じ名前のブランチの PR は、手元のブランチのものではない
    pr(6, "feat/d", "MERGED", "someone"),
  ];
  const notices = noticesFor(7, worktrees, prs, { dismissed: new Set([5]), headOwner: "Me" });
  assert.deepEqual(notices, [
    { project_id: 7, worktree: "/w/feat/a", branch: "feat/a", pr: { number: 2, title: "PR 2", url: "https://github.com/o/r/pull/2", state: "MERGED" }, dismissed: false },
    { project_id: 7, worktree: "/w/feat/c", branch: "feat/c", pr: { number: 5, title: "PR 5", url: "https://github.com/o/r/pull/5", state: "CLOSED" }, dismissed: true },
  ]);
  assert.deepEqual(noticesFor(7, worktrees, [], { dismissed: new Set(), headOwner: "me" }), []);
});

test("見張るプロジェクト: しまったものと見えないプロジェクト（共通のノート）には聞かない", async () => {
  const store = testStore();
  afterTest(() => store.close());
  store.projects.create({ name: "p", repo_path: "/repo/p", provider: "claude" });
  store.projects.update(store.projects.create({ name: "old", repo_path: "/repo/old", provider: "claude" }).id, { archived_at: "2026-01-01T00:00:00.000Z" });
  store.projects.create({ name: "共通のノート", repo_path: "/repo/common", provider: "claude", kind: "common" });
  const asked: string[] = [];
  const watch = new WorktreePrWatch({
    store,
    publish: () => {},
    clock: manualClock(),
    isGitRepo: async (repo) => {
      asked.push(repo);
      return false;
    },
    listWorktrees: async () => [],
    listPullRequests: async () => [],
  });
  await watch.checkAll();
  assert.deepEqual(asked, ["/repo/p"]);
});
