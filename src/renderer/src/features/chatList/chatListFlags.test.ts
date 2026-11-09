import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat } from "@shared/testing/factories";
import { approvalIndex } from "@/features/chat/chatState";
import { isWaitingState, waitingChats } from "./chatListFlags";

const chats = [
  makeChat(1, { status: "running" }),
  makeChat(2, { status: "running" }),
  // 回答待ちの依頼がある（approvals から引く）
  makeChat(3, { status: "running" }),
  makeChat(4, { status: "completed", unread: true }),
  makeChat(5, { status: "failed", unread: true }),
  // 見た失敗は既読なので、要対応に入らない
  makeChat(9, { status: "failed" }),
  makeChat(6, { status: "completed" }),
  // 回答待ちの依頼がある（approvals から引く）
  makeChat(7, { status: "running" }),
  // アーカイブ済みは数えない
  makeChat(8, { status: "running", archived_at: "2026-01-01T00:00:00Z" }),
];
const pending = approvalIndex([{ chat_id: 3 }, { chat_id: 7 }, { chat_id: 8 }]);

test("isWaitingState: 自分が見る番は回答待ちと未読（失敗したものも未読）", () => {
  assert.equal(isWaitingState("needs_input"), true);
  assert.equal(isWaitingState("unread"), true);
  assert.equal(isWaitingState("failed"), true);
  assert.equal(isWaitingState("running"), false);
  assert.equal(isWaitingState("read"), false);
});

test("waitingRuns: 要対応のチャットだけ（元の順のまま。アーカイブ済みは除く）", () => {
  assert.deepEqual(
    waitingChats(chats, pending).map((r) => r.id),
    [3, 4, 5, 7],
  );
});
