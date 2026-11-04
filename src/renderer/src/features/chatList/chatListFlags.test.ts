import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { approvalIndex } from "@/features/chat/chatState";
import { isWaitingState, waitingChats } from "./chatListFlags";

const chat = (id: number, patch: Partial<Chat> = {}): Chat => ({ id, status: "completed", unread: false, archived_at: null, ...patch }) as Chat;
const chats = [
  chat(1, { status: "running" }),
  chat(2, { status: "queued" }),
  chat(3, { status: "waiting" }),
  chat(4, { status: "completed", unread: true }),
  chat(5, { status: "failed", unread: true }),
  // 見た失敗は既読なので、自分待ちに入らない
  chat(9, { status: "failed" }),
  chat(6, { status: "completed" }),
  // 回答待ちの依頼がある（approvals から引く）
  chat(7, { status: "running" }),
  // アーカイブ済みは数えない
  chat(8, { status: "waiting", archived_at: "2026-01-01T00:00:00Z" }),
];
const pending = approvalIndex([{ chat_id: 7 }]);

test("isWaitingState: 自分が見る番は回答待ちと未読（失敗したものも未読）", () => {
  assert.equal(isWaitingState("needs_input"), true);
  assert.equal(isWaitingState("unread"), true);
  assert.equal(isWaitingState("failed"), true);
  assert.equal(isWaitingState("running"), false);
  assert.equal(isWaitingState("read"), false);
});

test("waitingRuns: 自分待ちのチャットだけ（元の順のまま。アーカイブ済みは除く）", () => {
  assert.deepEqual(
    waitingChats(chats, pending).map((r) => r.id),
    [3, 4, 5, 7],
  );
});
