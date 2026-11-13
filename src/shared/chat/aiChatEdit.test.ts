import assert from "node:assert/strict";
import { test } from "node:test";
import { describeUpdateChat, updateChatChanges } from "./aiChatEdit.js";

test("updateChatChanges: 渡した項目だけを言葉にし、省いた項目は入れない", () => {
  assert.deepEqual(updateChatChanges({ chat_id: 3, title: "  【済】調査  ", pinned: true }), ["名前を『【済】調査』に変えた", "固定した"]);
  assert.deepEqual(updateChatChanges({ chat_id: 3, pinned: false }), ["固定を外した"]);
  assert.deepEqual(updateChatChanges({ chat_id: 3, group_id: null }), ["グループから外した"]);
  assert.deepEqual(updateChatChanges({ chat_id: 3, group_id: 7 }), ["グループ（ID 7）に入れた"]);
  assert.deepEqual(updateChatChanges({ chat_id: 3 }), []);
});

test("describeUpdateChat: どのチャットに何をしたかの 1 文", () => {
  assert.equal(describeUpdateChat({ chat_id: 12, title: "ログの調査", pinned: true }), "名前を『ログの調査』に変えた・固定した（チャット 12）");
  assert.equal(describeUpdateChat({ chat_id: 12, pinned: true, group_id: 3 }), "固定した・グループ（ID 3）に入れた（チャット 12）");
  assert.equal(describeUpdateChat({ chat_id: 12 }), "チャット 12");
  assert.equal(describeUpdateChat({ title: "x" }), "名前を『x』に変えた");
});
