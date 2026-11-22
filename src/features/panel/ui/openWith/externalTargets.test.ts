import assert from "node:assert/strict";
import { test } from "vitest";
import { terminalTargetOf } from "./externalTargets";

const targets = [
  { cwd: "/repo/a", label: "a", projectId: 1 },
  { cwd: "/repo/b", label: "b", projectId: 2 },
];

test("ターミナルを開く場所: 見せているタブの作業場所（ワークツリー → そのプロジェクトの本体）、なければ開く場所が 1 つのときだけ", () => {
  assert.deepEqual(terminalTargetOf({ projectId: 2, worktree: "/repo/b-worktrees/feat" }, targets), { cwd: "/repo/b-worktrees/feat", label: "feat", projectId: 2 });
  assert.deepEqual(terminalTargetOf({ projectId: 2, worktree: null }, targets), targets[1]);
  assert.equal(terminalTargetOf(undefined, targets), undefined);
  assert.deepEqual(terminalTargetOf(undefined, [targets[0]]), targets[0]);
  assert.equal(terminalTargetOf(undefined, []), undefined);
});
