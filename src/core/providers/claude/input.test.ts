import assert from "node:assert/strict";
import { test } from "node:test";
import { createInputChannel } from "./input.js";

test("入力: 最初の指示のあとも開いたままで発言を足せ、渡していない発言があるうちは閉じない", async () => {
  const input = createInputChannel("はじめ");
  const it = input.messages[Symbol.asyncIterator]();
  assert.equal(((await it.next()).value as { message: { content: string } }).message.content, "はじめ");
  assert.equal(input.push("追加"), true);
  // まだ渡していない発言があるので閉じない
  assert.equal(input.close(), false);
  assert.equal(((await it.next()).value as { message: { content: string } }).message.content, "追加");
  assert.equal(input.close(), true);
  assert.equal((await it.next()).done, true);
  assert.equal(input.push("閉じたあと"), false);
});

test("入力: 待っている間に閉じると終わる。force なら渡していない発言があっても閉じる", async () => {
  const input = createInputChannel("はじめ");
  const it = input.messages[Symbol.asyncIterator]();
  await it.next();
  const waiting = it.next();
  input.close();
  assert.equal((await waiting).done, true);
  const forced = createInputChannel("はじめ");
  forced.push("残り");
  assert.equal(forced.close(true), true);
});
