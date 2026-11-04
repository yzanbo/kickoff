import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "@shared/types";
import { approvalIndex } from "@/features/chat/chatState";
import { isWaitingState, waitingRuns } from "./chatListFlags";

const run = (id: number, patch: Partial<Run> = {}): Run => ({ id, status: "completed", attention: false, archived_at: null, ...patch }) as Run;
const runs = [
  run(1, { status: "running" }),
  run(2, { status: "queued" }),
  run(3, { status: "waiting" }),
  run(4, { status: "completed", attention: true }),
  run(5, { status: "failed", attention: true }),
  // 見た失敗は既読なので、自分待ちに入らない
  run(9, { status: "failed" }),
  run(6, { status: "completed" }),
  // 回答待ちの依頼がある（approvals から引く）
  run(7, { status: "running" }),
  // アーカイブ済みは数えない
  run(8, { status: "waiting", archived_at: "2026-01-01T00:00:00Z" }),
];
const pending = approvalIndex([{ run_id: 7 }]);

test("isWaitingState: 自分が見る番は回答待ちと未読（失敗したものも未読）", () => {
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
