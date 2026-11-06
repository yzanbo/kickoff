import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoPreCompactMessage,
  isPreCompactDone,
  manualPreCompactMessage,
  PRE_COMPACT_DONE,
  preCompactPromptFor,
  relayedText,
  relayMessage,
  RESUME_PROMPT,
  resumePrompt,
  resumeRequest,
  retryRequest,
} from "./prompts";

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

test("再開の頼み: 出力の上限で止まったものは、短く分けるよう添える", () => {
  assert.doesNotMatch(resumeRequest("a1", "調べもの"), /書ける量の上限/);
  assert.match(resumeRequest("a1", "調べもの", { outputLimit: true }), /報告は短くまとめる/);
  assert.match(retryRequest({ description: "調べもの", outputLimit: true }), /報告は短くまとめる/);
  assert.doesNotMatch(retryRequest({ description: "調べもの" }), /報告は短くまとめる/);
});

test("通信が戻って自動で再開する指示: 止まったサブエージェントがあれば、名前と ID を添えて続きから再開を頼む", () => {
  assert.equal(resumePrompt([]), RESUME_PROMPT);
  const prompt = resumePrompt([{ agentId: "a1", description: "調査" }]);
  assert.ok(prompt.startsWith(RESUME_PROMPT));
  assert.match(prompt, /SendMessage/);
  assert.match(prompt, /- 「調査」（ID: a1）/);
});

test("圧縮前指示: 共通 → プロジェクトの順に空行でつなぎ、空のものは除く", () => {
  assert.equal(preCompactPromptFor("メモを残す", "TODO を書く"), "メモを残す\n\nTODO を書く");
  assert.equal(preCompactPromptFor(null, " TODO を書く "), "TODO を書く");
  assert.equal(preCompactPromptFor("  ", null), null);
  assert.equal(preCompactPromptFor(null, null), null);
});

test("圧縮前指示: 自動のときだけ合図の一文を頼み、その一文で済んだと分かる", () => {
  const auto = autoPreCompactMessage("メモを残す");
  assert.ok(auto.startsWith("【圧縮前指示】"));
  assert.ok(auto.endsWith("---\nメモを残す"));
  assert.match(auto, new RegExp(PRE_COMPACT_DONE));
  assert.doesNotMatch(manualPreCompactMessage("メモを残す"), new RegExp(PRE_COMPACT_DONE));
  assert.ok(isPreCompactDone(`${PRE_COMPACT_DONE}。`));
  assert.ok(!isPreCompactDone("メモを残しました"));
});
