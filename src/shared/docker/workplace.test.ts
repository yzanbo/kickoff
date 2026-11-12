import assert from "node:assert/strict";
import { test } from "node:test";
import { workplaceText } from "./workplace";

test("workplaceText: 本体とワークツリー", () => {
  assert.equal(workplaceText(null, "main"), "本体 | main");
  assert.equal(workplaceText(null, null), "本体");
  assert.equal(workplaceText("/r/app-worktrees/feat-x", "feat-x"), "WT | feat-x");
  assert.equal(workplaceText("/r/app-worktrees/detached", null), "WT | detached");
});
