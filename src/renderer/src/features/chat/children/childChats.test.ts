import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat } from "@shared/testing/factories";
import { ancestorsOf, childActivityOf, handBackText, rootChatOf } from "./childChats";

test("handBackText: どの子チャットの答えかを添えて、答えを引用にする（空行も引用の中に残す）", () => {
  assert.equal(handBackText({ title: "違い" }, "A です。\n\nB です。\n"), "子チャット「違い」の答え:\n> A です。\n>\n> B です。\n\n");
  assert.equal(handBackText({ title: "" }, "x"), "子チャット「Untitled Chat」の答え:\n> x\n\n");
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

test("childActivityOf: 子孫と、その中の作業中・回答待ちを数え、回答待ちがあれば回答待ちにする（アーカイブ済みとその下は数えない）", () => {
  const states = new Map<number, string>([
    [2, "running"],
    [3, "read"],
    [4, "running"],
    [5, "needs_input"],
    [6, "running"],
  ]);
  const childrenOf = new Map([
    [1, [makeChat(2, { parent_chat_id: 1 }), makeChat(3, { parent_chat_id: 1 }), makeChat(5, { parent_chat_id: 1, archived_at: "2026-11-11T00:00:00Z" })]],
    [3, [makeChat(4, { parent_chat_id: 3 })]],
    [5, [makeChat(6, { parent_chat_id: 5 })]],
  ]);
  const stateOf = (c: { id: number }) => states.get(c.id) ?? "read";
  // 子の 2・孫の 4 が作業中（アーカイブ済みの 5 とその下の 6 は数えない）
  assert.deepEqual(childActivityOf(1, childrenOf, stateOf), { state: "running", count: 2, total: 3 });
  // 子チャットのタブでは、その下（孫）だけ
  assert.deepEqual(childActivityOf(3, childrenOf, stateOf), { state: "running", count: 1, total: 1 });
  assert.equal(childActivityOf(2, childrenOf, stateOf), null);
  // 子孫がどれも動いていなければ idle（子チャットがあることは出す）
  states.set(4, "read");
  assert.deepEqual(childActivityOf(3, childrenOf, stateOf), { state: "idle", count: 0, total: 1 });
  states.set(4, "running");
  states.set(3, "needs_input");
  assert.deepEqual(childActivityOf(1, childrenOf, stateOf), { state: "needs_input", count: 3, total: 3 });
});
