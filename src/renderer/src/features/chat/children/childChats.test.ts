import assert from "node:assert/strict";
import { test } from "node:test";
import { handBackText, rootChatOf } from "./childChats";

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
});
