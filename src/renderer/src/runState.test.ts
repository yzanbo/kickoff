import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "../../core/types";
import { approvalIndex, runStateOf, stateCounts } from "./runState";

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

test("stateCounts: 作業中・回答待ち・確認待ちの数（カンバンの列と同じ決め方。完了とアーカイブ済みは数えない）", () => {
  const list = [
    run(1, "running"),
    run(2, "queued"),
    run(3, "waiting"),
    run(4, "completed", 1),
    run(5, "failed"),
    run(6, "completed"),
    // 回答待ちの依頼がある（approvals から引く）
    run(7, "running"),
  ];
  const archived = { ...run(8, "waiting"), archived_at: "2026-01-01T00:00:00Z" } as Run;
  assert.deepEqual(stateCounts([...list, archived], approvalIndex([{ run_id: 7 }])), { running: 2, needs_input: 2, review: 2 });
  assert.deepEqual(stateCounts([], approvalIndex([])), { running: 0, needs_input: 0, review: 0 });
});

test("stateCounts: 依頼と状態がずれた一瞬（依頼が残ったまま止まった・依頼が消えて状態が戻る前）も、0 未満や二重には数えない", () => {
  // 以前の見出しは「作業中 = 動いている数 − 回答待ちの数」の引き算で、ここが -1 になっていた
  assert.deepEqual(stateCounts([run(1, "completed")], approvalIndex([{ run_id: 1 }])), { running: 0, needs_input: 1, review: 0 });
  assert.deepEqual(stateCounts([run(1, "waiting")], approvalIndex([])), { running: 0, needs_input: 1, review: 0 });
});
