import { test } from "vitest";
import assert from "node:assert/strict";
import { followWorktree, type Followed } from "./useSideWorktree";

const NONE: Followed = { follow: null, worktree: undefined };
const chat = (id: number, projectId: number, worktree: string | null) => ({ id, project_id: projectId, worktree_path: worktree });

test("真ん中のチャットの作業場所に付いていく", () => {
  assert.deepEqual(followWorktree(NONE, chat(1, 10, "/wt/a"), 10), { follow: "1:/wt/a", worktree: "/wt/a" });
  assert.deepEqual(followWorktree(NONE, chat(2, 10, null), 10), { follow: "2:", worktree: undefined });
});

test("チャットがない・ほかのプロジェクトのチャットなら直前のまま", () => {
  const state: Followed = { follow: "1:/wt/a", worktree: "/wt/b" };
  assert.equal(followWorktree(state, undefined, 10), state);
  assert.equal(followWorktree(state, chat(3, 11, "/wt/c"), 10), state);
});

test("同じチャット・同じ作業場所なら、中で選び直した作業場所を残す", () => {
  const state: Followed = { follow: "1:/wt/a", worktree: undefined };
  assert.equal(followWorktree(state, chat(1, 10, "/wt/a"), 10), state);
});

test("チャットの作業場所が変わったら付いていき直す", () => {
  const state: Followed = { follow: "1:/wt/a", worktree: undefined };
  assert.deepEqual(followWorktree(state, chat(1, 10, "/wt/z"), 10), { follow: "1:/wt/z", worktree: "/wt/z" });
});
