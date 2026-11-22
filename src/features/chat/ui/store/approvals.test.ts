import assert from "node:assert/strict";
import { test } from "vitest";
import type { Approval } from "@shared/chat/approvalTypes";
import { groupByChat } from "./approvals";

const approval = (id: string, chatId: number) => ({ id, chat_id: chatId }) as Approval;

test("groupByChat: チャットごとに届いた順に分け、前と同じ依頼が同じ順に並ぶチャットは前の配列を使う", () => {
  const a = approval("a", 1);
  const b = approval("b", 2);
  const first = groupByChat([a, b]);
  assert.deepEqual(first.get(1), [a]);
  assert.deepEqual(first.get(2), [b]);
  const c = approval("c", 2);
  const next = groupByChat([a, b, c], first);
  assert.equal(next.get(1), first.get(1));
  assert.deepEqual(next.get(2), [b, c]);
  assert.equal(groupByChat([b, c], next).has(1), false);
});
