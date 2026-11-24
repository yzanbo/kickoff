import assert from "node:assert/strict";
import { test } from "vitest";
import { addTargetsOf } from "./addTargets";

test("addTargetsOf: チャットの画面ではこのチャットだけ（チャットの外ではなし）", () => {
  assert.deepEqual(addTargetsOf({ chatId: 3, mainChatId: null, role: "chat", mainName: "" }), [{ kind: "this", chatId: 3, name: "チャット" }]);
  assert.deepEqual(addTargetsOf({ chatId: null, mainChatId: null, role: null, mainName: "" }), []);
});

test("addTargetsOf: 右の欄・別ウィンドウは足す先のチャットを名前で。中が別のチャットなら、子チャット・ノートのチャットも足す", () => {
  const main = { kind: "main", chatId: 1, name: "「機能開発」" };
  // 足す先と同じチャット・チャットの外（変更・ファイルの画面）
  assert.deepEqual(addTargetsOf({ chatId: 1, mainChatId: 1, role: "chat", mainName: "「機能開発」" }), [main]);
  assert.deepEqual(addTargetsOf({ chatId: null, mainChatId: 1, role: null, mainName: "「機能開発」" }), [main]);
  // 右の欄の子チャット・ノートのチャット・種類の分からないチャット
  assert.deepEqual(addTargetsOf({ chatId: 4, mainChatId: 1, role: "child", mainName: "「機能開発」" })[1], { kind: "inner", chatId: 4, name: "子チャット" });
  assert.deepEqual(addTargetsOf({ chatId: 5, mainChatId: 1, role: "note", mainName: "「機能開発」" })[1], { kind: "inner", chatId: 5, name: "ノートのチャット" });
  assert.deepEqual(addTargetsOf({ chatId: 6, mainChatId: 1, role: null, mainName: "「機能開発」" })[1], { kind: "inner", chatId: 6, name: "このチャット" });
});
