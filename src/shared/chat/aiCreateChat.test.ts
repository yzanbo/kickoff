import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_CHILD_CHAT_TOOL_LEGACY, AI_CREATE_CHAT_TOOL, createdChatIdOf, createdChatMark, isCreateChatTool, relationOf } from "./aiCreateChat";

test("createdChatIdOf: 結果の印から作ったチャットの ID を読む", () => {
  assert.equal(createdChatIdOf(`子チャット「調べもの」を作り、依頼を送りました${createdChatMark(42)}。`), 42);
});

test("createdChatIdOf: 印がなければ null", () => {
  assert.equal(createdChatIdOf("利用者が断りました"), null);
  assert.equal(createdChatIdOf(""), null);
});

test("relationOf: 入力の relation を読み、前の版の入力・知らない値は子チャット", () => {
  assert.equal(relationOf({ relation: "sibling" }), "sibling");
  assert.equal(relationOf({ relation: "root" }), "root");
  assert.equal(relationOf({ text: "前の版" }), "child");
  assert.equal(relationOf({ relation: "cousin" }), "child");
});

test("isCreateChatTool: いまのツールと前の版のツール", () => {
  assert.ok(isCreateChatTool(AI_CREATE_CHAT_TOOL));
  assert.ok(isCreateChatTool(AI_CHILD_CHAT_TOOL_LEGACY));
  assert.ok(!isCreateChatTool("Bash"));
});
