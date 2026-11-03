import assert from "node:assert/strict";
import { test } from "node:test";
import type { Approval, Run } from "../../core/types";
import { indexApprovals } from "./approvalsContext";

const approval = (run_id: number) => ({ run_id }) as Approval;
const run = (id: number, status: Run["status"]) => ({ id, status, attention: false }) as unknown as Run;

test("indexApprovals: 回答待ちの依頼があるチャットは回答待ち、依頼の数も引ける", () => {
  const states = indexApprovals([approval(1), approval(1), approval(3)]);
  assert.equal(states.stateOf(run(1, "running")), "needs_input");
  assert.equal(states.stateOf(run(2, "running")), "running");
  assert.equal(states.pendingCount(1), 2);
  assert.equal(states.pendingCount(2), 0);
  assert.deepEqual([...states.pending].sort(), [1, 3]);
});
