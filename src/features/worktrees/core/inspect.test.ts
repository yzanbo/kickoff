// AI が指したワークツリーの引き当てと、選んでもらう一覧の文
import assert from "node:assert/strict";
import { test } from "vitest";
import { makeWorktree } from "@shared/foundation/testing/factories";
import { findNamedWorktree, worktreeNames } from "./inspect";

const list = [
  makeWorktree("/r/app", { main: true, branch: "main" }),
  makeWorktree("/r/app-worktrees/feat-x/web", { root: "/r/app-worktrees/feat-x", branch: "feat/x" }),
  makeWorktree("/r/app-worktrees/detached", { branch: null }),
];

test("findNamedWorktree: フォルダ・一番上・ブランチの名前・フォルダの名前で引く。前後の空白は無視し、空なら undefined", () => {
  for (const name of ["/r/app-worktrees/feat-x/web", "/r/app-worktrees/feat-x", "feat/x", " feat-x "]) assert.equal(findNamedWorktree(list, name)?.branch, "feat/x");
  assert.equal(findNamedWorktree(list, "main")?.main, true);
  assert.equal(findNamedWorktree(list, "nope"), undefined);
  assert.equal(findNamedWorktree(list, "  "), undefined);
  assert.equal(findNamedWorktree(list, undefined), undefined);
});

test("worktreeNames: 本体を除いたブランチの名前（ブランチがなければフォルダ）。なければ「（なし）」", () => {
  assert.equal(worktreeNames(list), "feat/x、/r/app-worktrees/detached");
  assert.equal(worktreeNames(list.slice(0, 1)), "（なし）");
});
