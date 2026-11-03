import assert from "node:assert/strict";
import { test } from "node:test";
import { relayedText, relayMessage, resumeRequest, retryRequest } from "./subagentRelay.js";

test("サブエージェントへの追加の指示: 宛先の ID が合うときだけ、本文を取り出す", () => {
  const message = relayMessage("a1b2", "調べもの", "ついでに README も見て\n2 行目");
  assert.equal(relayedText(message, "a1b2"), "ついでに README も見て\n2 行目");
  assert.equal(relayedText(message, "zzz"), undefined);
  assert.equal(relayedText("ふつうの指示", "a1b2"), undefined);
});

test("止まったサブエージェントの再開・やり直し: 宛先と依頼を添え、追加の指示とは見分ける", () => {
  const resume = resumeRequest("a1b2", "調べもの");
  assert.match(resume, /「調べもの」（ID: a1b2）/);
  assert.match(resume, /SendMessage/);
  assert.equal(relayedText(resume, "a1b2"), undefined);
  // やり直し: 依頼の文をそのまま添える。長すぎれば、前と同じ依頼を使うよう頼む
  const retry = retryRequest({ description: "調べもの", subagentType: "Explore", prompt: "README を読んで" });
  assert.match(retry, /subagent_type: Explore/);
  assert.ok(retry.endsWith("---\nREADME を読んで"));
  const long = retryRequest({ description: "調べもの", prompt: "あ".repeat(7000) });
  assert.doesNotMatch(long, /あああ/);
  assert.match(long, /前にこのサブエージェントを起動したときと同じもの/);
});
