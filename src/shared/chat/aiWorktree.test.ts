import assert from "node:assert/strict";
import { test } from "node:test";
import { describeFinishWorktree } from "./aiWorktree";

test("describeFinishWorktree: 指したワークツリー、省いたらこのチャットのワークツリー", () => {
  assert.equal(describeFinishWorktree({ worktree: " feat/a " }), "feat/a");
  assert.equal(describeFinishWorktree({}), "このチャットのワークツリー");
});
