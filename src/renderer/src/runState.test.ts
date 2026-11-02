import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "../../core/types";
import { approvalIndex, runStateOf } from "./runState";

const run = (id: number, status: Run["status"], attention = 0) => ({ id, status, attention }) as unknown as Run;

test("approvalIndex: 回答待ちの依頼があるチャットの ID の集まり（同じチャットの依頼が複数あっても 1 つ）", () => {
  const index = approvalIndex([{ run_id: 1 }, { run_id: 3 }, { run_id: 1 }]);
  assert.deepEqual([...index].sort(), [1, 3]);
  assert.equal(approvalIndex([]).size, 0);
});

test("runStateOf: 回答待ちの依頼があれば、作業中でも回答待ち", () => {
  const index = approvalIndex([{ run_id: 1 }]);
  assert.equal(runStateOf(run(1, "running"), index), "needs_input");
  assert.equal(runStateOf(run(2, "running"), index), "running");
});

test("runStateOf: 依頼がなければ、チャットの状態どおり（失敗・確認待ち・完了）", () => {
  const none = approvalIndex([]);
  assert.equal(runStateOf(run(1, "waiting"), none), "needs_input");
  assert.equal(runStateOf(run(1, "failed"), none), "failed");
  assert.equal(runStateOf(run(1, "queued"), none), "running");
  assert.equal(runStateOf(run(1, "completed", 1), none), "attention");
  assert.equal(runStateOf(run(1, "completed"), none), "done");
});
