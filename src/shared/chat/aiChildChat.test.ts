import assert from "node:assert/strict";
import { test } from "node:test";
import { childChatIdOf, childChatMark } from "./aiChildChat";

test("childChatIdOf: 結果の印から子チャットの ID を読む", () => {
  assert.equal(childChatIdOf(`子チャット「調べもの」を作り、依頼を送りました${childChatMark(42)}。`), 42);
});

test("childChatIdOf: 印がなければ null", () => {
  assert.equal(childChatIdOf("利用者が断りました"), null);
  assert.equal(childChatIdOf(""), null);
});
