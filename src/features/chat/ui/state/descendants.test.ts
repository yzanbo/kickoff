import assert from "node:assert/strict";
import { test } from "vitest";
import type { AgentState } from "@shared/chat/types";
import { makeChat } from "@shared/chat/testing";
import { ancestorsOf, descendantStates, rootChatOf } from "./descendants";

const states = new Map<number, AgentState>([
  [2, "running"],
  [3, "read"],
  [4, "unread"],
  [5, "needs_input"],
  [6, "failed"],
  [7, "running"],
]);
const children = new Map([
  [1, [makeChat(2, { parent_chat_id: 1 }), makeChat(3, { parent_chat_id: 1 }), makeChat(5, { parent_chat_id: 1, archived_at: "2026-11-11T00:00:00Z" })]],
  [3, [makeChat(4, { parent_chat_id: 3 }), makeChat(7, { parent_chat_id: 3 })]],
  [5, [makeChat(6, { parent_chat_id: 5 })]],
  // 輪になっていても止まる
  [7, [makeChat(1, { parent_chat_id: 7 })]],
]);
const childrenOf = (id: number) => children.get(id);
const stateOf = (c: { id: number }) => states.get(c.id) ?? "read";

test("descendantStates: 子孫の状態を木の順に返す（アーカイブ済みとその下は withArchived のときだけ・輪で止まる）", () => {
  assert.deepEqual(descendantStates(1, childrenOf, stateOf), ["running", "read", "unread", "running"]);
  assert.deepEqual(descendantStates(1, childrenOf, stateOf, { withArchived: true }), ["running", "read", "unread", "running", "needs_input", "failed"]);
  assert.deepEqual(descendantStates(2, childrenOf, stateOf), []);
});

test("descendantStates: depth で何段下まで数えるかを決める（1 = 直接の子だけ）", () => {
  assert.deepEqual(descendantStates(1, childrenOf, stateOf, { depth: 1 }), ["running", "read"]);
  assert.deepEqual(descendantStates(1, childrenOf, stateOf, { depth: 1, withArchived: true }), ["running", "read", "needs_input"]);
});

test("rootChatOf: 親をたどって、いちばん上のチャットを返す（親が分からなければそこまで・輪でも止まる）", () => {
  const chats = new Map([
    [1, { id: 1, parent_chat_id: null }],
    [2, { id: 2, parent_chat_id: 1 }],
    [3, { id: 3, parent_chat_id: 2 }],
    [4, { id: 4, parent_chat_id: 99 }],
    [5, { id: 5, parent_chat_id: 6 }],
    [6, { id: 6, parent_chat_id: 5 }],
  ]);
  const lookup = (id: number) => chats.get(id);
  assert.equal(rootChatOf(chats.get(3)!, lookup).id, 1);
  assert.equal(rootChatOf(chats.get(1)!, lookup).id, 1);
  assert.equal(rootChatOf(chats.get(4)!, lookup).id, 4);
  assert.ok([5, 6].includes(rootChatOf(chats.get(5)!, lookup).id));
  // 祖先は根 → 親の順（親のないチャットは空・分からない親の手前まで・輪でも止まる）
  const ids = (id: number) => ancestorsOf(chats.get(id)!, lookup).map((c) => c.id);
  assert.deepEqual(ids(3), [1, 2]);
  assert.deepEqual(ids(1), []);
  assert.deepEqual(ids(4), []);
  assert.deepEqual(ids(5), [6]);
});
