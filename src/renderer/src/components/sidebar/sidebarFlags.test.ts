import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "../../../../core/types";
import { approvalIndex } from "../../runState";
import { isWaitingState, waitingRuns } from "./sidebarFlags";

const run = (id: number, patch: Partial<Run> = {}): Run => ({ id, status: "completed", attention: 0, archived_at: null, ...patch }) as Run;
const runs = [
  run(1, { status: "running" }),
  run(2, { status: "queued" }),
  run(3, { status: "waiting" }),
  run(4, { status: "completed", attention: 1 }),
  run(5, { status: "failed" }),
  run(6, { status: "completed" }),
  // 回答待ちの依頼がある（approvals から引く）
  run(7, { status: "running" }),
  // アーカイブ済みは数えない
  run(8, { status: "waiting", archived_at: "2026-01-01T00:00:00Z" }),
];
const pending = approvalIndex([{ run_id: 7 }]);

test("isWaitingState: 自分が見る番は回答待ちと確認待ち（失敗したものも確認待ち）", () => {
  assert.equal(isWaitingState("needs_input"), true);
  assert.equal(isWaitingState("attention"), true);
  assert.equal(isWaitingState("failed"), true);
  assert.equal(isWaitingState("running"), false);
  assert.equal(isWaitingState("done"), false);
});

test("waitingRuns: 自分待ちのチャットだけ（元の順のまま。アーカイブ済みは除く）", () => {
  assert.deepEqual(
    waitingRuns(runs, pending).map((r) => r.id),
    [3, 4, 5, 7],
  );
});
