import assert from "node:assert/strict";
import { test } from "node:test";
import { relayedText, relayMessage } from "./subagentRelay.js";

test("サブエージェントへの追加の指示: 宛先の ID が合うときだけ、本文を取り出す", () => {
  const message = relayMessage("a1b2", "調べもの", "ついでに README も見て\n2 行目");
  assert.equal(relayedText(message, "a1b2"), "ついでに README も見て\n2 行目");
  assert.equal(relayedText(message, "zzz"), undefined);
  assert.equal(relayedText("ふつうの指示", "a1b2"), undefined);
});
