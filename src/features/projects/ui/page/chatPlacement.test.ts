import assert from "node:assert/strict";
import { test } from "vitest";
import { boardTabOf } from "./chatPlacement";

test("boardTabOf: チャット・新しいチャットの URL では、チャットをボードと分けていれば「チャット」タブ、ほかはボード", () => {
  assert.equal(boardTabOf("together"), "board");
  assert.equal(boardTabOf("separate"), "chats");
});
