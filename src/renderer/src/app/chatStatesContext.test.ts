import assert from "node:assert/strict";
import { test } from "node:test";
import type { Approval, Chat } from "@shared/types";
import { indexApprovals } from "./chatStatesContext";

const approval = (chat_id: number) => ({ chat_id }) as Approval;
const chat = (id: number, status: Chat["status"]) => ({ id, status, unread: false }) as unknown as Chat;

test("indexApprovals: 回答待ちの依頼があるチャットは回答待ち、依頼の数も引ける", () => {
  const states = indexApprovals([approval(1), approval(1), approval(3)]);
  assert.equal(states.stateOf(chat(1, "running")), "needs_input");
  assert.equal(states.stateOf(chat(2, "running")), "running");
  assert.equal(states.pendingCount(1), 2);
  assert.equal(states.pendingCount(2), 0);
  assert.deepEqual([...states.pending].sort(), [1, 3]);
});
