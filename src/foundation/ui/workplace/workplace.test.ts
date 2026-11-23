import assert from "node:assert/strict";
import { test } from "vitest";
import type { Chat } from "@shared/chat/types";
import { makeWorktree } from "@shared/foundation/testing/data";
import { compareWorkplaces, countBusyAt, sameWorkplace, workplaceKey, workplaceOf, workplacePath } from "./workplace";

const list = [makeWorktree("/repo", { branch: "main", main: true }), makeWorktree("/repo-worktrees/feat-a", { branch: "feat/a" }), makeWorktree("/repo-worktrees/gone", { branch: "feat/gone", prunable: true })];

test("作業場所: 本体・ワークツリーは、いまのブランチ名で出す", () => {
  assert.deepEqual(
    { ...workplaceOf({ worktree_path: null, branch: null }, list), title: undefined },
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
  const detached = [makeWorktree("/repo", { branch: null, head: "a1b2c3d4e5f6", main: true })];
  assert.equal(workplaceOf({ worktree_path: null, branch: null }, detached).name, "HEAD a1b2c3d");
});

test("作業場所: フォルダが消えたワークツリー（Git に記録が残る・残らない）はフォルダなし", () => {
  const prunable = workplaceOf({ worktree_path: "/repo-worktrees/gone", branch: null }, list);
  assert.equal(prunable.kind, "missing");
  assert.equal(prunable.name, "feat/gone");
  // 記録も消えていれば、最後に作業したブランチ → フォルダ名の順で出す
  assert.equal(workplaceOf({ worktree_path: "/repo-worktrees/feat-x", branch: "feat/x" }, list).name, "feat/x");
  assert.equal(workplaceOf({ worktree_path: "/repo-worktrees/feat-x", branch: "feat/x" }, list).kind, "missing");
  assert.equal(workplaceOf({ worktree_path: "/repo-worktrees/feat-x", branch: null }, list).name, "feat-x");
});

test("本体は現在のブランチを表示し、片付けたブランチは説明に残す", () => {
  const main = workplaceOf({ worktree_path: null, branch: "old" }, list);
  assert.equal(main.kind, "main");
  assert.equal(main.name, "main");
  assert.doesNotMatch(main.title, /片付けた/);
  const finished = workplaceOf({ worktree_path: null, branch: "feat/done", finished_worktree_branch: "feat/done" }, list);
  assert.equal(finished.key, "");
  assert.equal(finished.name, "main");
  assert.match(finished.title, /feat\/done/);
});

test("作業場所: 一覧を読み込むまでは、最後に作業したブランチ → フォルダ名で仮に出す（フォルダなしにはしない）", () => {
  assert.deepEqual(
    { ...workplaceOf({ worktree_path: "/repo-worktrees/feat-a", branch: "feat/a" }, undefined), title: undefined },
    { key: "/repo-worktrees/feat-a", kind: "worktree", name: "feat/a", title: undefined },
  );
  assert.equal(workplaceOf({ worktree_path: null, branch: "feat/done" }, undefined).kind, "main");
  // Git でない本体: 名前なし（印は出さない）
  assert.equal(workplaceOf({ worktree_path: null, branch: null }, []).name, "");
});

test("作業場所の並び: 本体 → ワークツリー（名前順）→ フォルダなし", () => {
  const places = [
    workplaceOf({ worktree_path: null, branch: "feat/done" }, list),
    workplaceOf({ worktree_path: "/repo-worktrees/gone", branch: null }, list),
    workplaceOf({ worktree_path: "/repo-worktrees/feat-a", branch: null }, list),
    workplaceOf({ worktree_path: null, branch: null }, list),
  ];
  assert.deepEqual(places.sort(compareWorkplaces).map((p) => p.kind), ["main", "main", "worktree", "missing"]);
});

test("countBusyAt: 同じ作業場所（null = 本体）で作業中のチャットだけを数え、いまのチャットは数えない", () => {
  const chat = (id: number, worktree_path: string | null, status: Chat["status"]) => ({ id, worktree_path, status });
  const chats = [chat(1, null, "running"), chat(2, null, "running"), chat(3, null, "completed"), chat(4, "/repo-worktrees/feat-a", "running")];
  assert.equal(countBusyAt(chats, null), 2);
  assert.equal(countBusyAt(chats, null, 1), 1);
  assert.equal(countBusyAt(chats, "/repo-worktrees/feat-a"), 1);
  assert.equal(countBusyAt(chats, "/repo-worktrees/other"), 0);
});

test("作業場所の見分け: 本体は空の worktree、同じプロジェクトと同じフォルダなら同じ", () => {
  assert.equal(workplaceKey({ projectId: 3, worktree: null }), "3:");
  assert.equal(workplaceKey({ projectId: 3, worktree: "/repo-worktrees/feat-a" }), "3:/repo-worktrees/feat-a");
  assert.equal(sameWorkplace({ projectId: 3, worktree: null }, { projectId: 3, worktree: null }), true);
  assert.equal(sameWorkplace({ projectId: 3, worktree: null }, { projectId: 4, worktree: null }), false);
  assert.equal(sameWorkplace({ projectId: 3, worktree: "/a" }, { projectId: 3, worktree: null }), false);
});

test("選んだ作業場所のフォルダ: 本体は null、新しいワークツリーはまだないので undefined", () => {
  assert.equal(workplacePath({ kind: "main" }), null);
  assert.equal(workplacePath({ kind: "existing", path: "/a" }), "/a");
  assert.equal(workplacePath({ kind: "new", branch: "feat/b" }), undefined);
});
