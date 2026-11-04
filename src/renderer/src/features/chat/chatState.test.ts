import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { approvalIndex, chatStateOf, stateCounts } from "./chatState";

const chat = (id: number, status: Chat["status"], unread = false) => makeChat(id, { status, unread });

test("approvalIndex: 回答待ちの依頼があるチャットの ID の集まり（同じチャットの依頼が複数あっても 1 つ）", () => {
  const index = approvalIndex([{ chat_id: 1 }, { chat_id: 3 }, { chat_id: 1 }]);
  assert.deepEqual([...index].sort(), [1, 3]);
  assert.equal(approvalIndex([]).size, 0);
});

test("runStateOf: 回答待ちの依頼があれば、作業中でも回答待ち", () => {
  const index = approvalIndex([{ chat_id: 1 }]);
  assert.equal(chatStateOf(chat(1, "running"), index), "needs_input");
  assert.equal(chatStateOf(chat(2, "running"), index), "running");
});

test("runStateOf: 依頼がなければ、チャットの状態どおり（失敗・未読・既読）", () => {
  const none = approvalIndex([]);
  // 失敗も、見るまでは目立たせ（未読）、見たら既読
  assert.equal(chatStateOf(chat(1, "failed", true), none), "failed");
  assert.equal(chatStateOf(chat(1, "failed"), none), "read");
  assert.equal(chatStateOf(chat(1, "completed", true), none), "unread");
  assert.equal(chatStateOf(chat(1, "completed"), none), "read");
});

test("stateCounts: 作業中・回答待ち・未読の数（カンバンの列と同じ決め方。既読とアーカイブ済みは数えない）", () => {
  const list = [
    chat(1, "running"),
    chat(2, "running"),
    // 回答待ちの依頼がある（approvals から引く）
    chat(3, "running"),
    chat(4, "completed", true),
    chat(5, "failed", true),
    chat(6, "completed"),
    // 見た失敗は既読なので数えない
    chat(9, "failed"),
    // 回答待ちの依頼がある（approvals から引く）
    chat(7, "running"),
  ];
  const archived = { ...chat(8, "running"), archived_at: "2026-01-01T00:00:00Z" };
  assert.deepEqual(stateCounts([...list, archived], approvalIndex([{ chat_id: 3 }, { chat_id: 7 }, { chat_id: 8 }])), { running: 2, needs_input: 2, unread: 2 });
  assert.deepEqual(stateCounts([], approvalIndex([])), { running: 0, needs_input: 0, unread: 0 });
});

test("stateCounts: 依頼と状態がずれた一瞬（依頼が残ったまま止まった・依頼が消えて状態が戻る前）も、0 未満や二重には数えない", () => {
  // 以前の見出しは「作業中 = 動いている数 − 回答待ちの数」の引き算で、ここが -1 になっていた
  assert.deepEqual(stateCounts([chat(1, "completed")], approvalIndex([{ chat_id: 1 }])), { running: 0, needs_input: 1, unread: 0 });
});
