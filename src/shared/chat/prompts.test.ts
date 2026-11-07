import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoPreCompactMessage,
  isPreCompactDone,
  manualPreCompactMessage,
  PRE_COMPACT_DONE,
  compactPromptFor,
  postCompactMessage,
  relayedText,
  relayOf,
  subagentAskMessage,
  subagentAskOf,
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

test("サブエージェントへの追加の指示の宛先と本文: 送信待ちの行で前置きを隠して見せる", () => {
  assert.deepEqual(relayOf(relayMessage("a1b2", "調べもの", "README も見て\n2 行目")), { name: "調べもの", text: "README も見て\n2 行目" });
  assert.equal(relayOf("ふつうの指示"), undefined);
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

test("圧縮前指示・圧縮後指示: オンの分を共通 → プロジェクトの順に空行でつなぎ、空・オフのものは除く", () => {
  const source = (pre: string | null, enabled = true) => ({ pre_compact_prompt: pre, post_compact_prompt: "あと", pre_compact_enabled: enabled, post_compact_enabled: true });
  assert.equal(compactPromptFor("pre", source("メモを残す"), source("TODO を書く")), "メモを残す\n\nTODO を書く");
  assert.equal(compactPromptFor("pre", source(null), source(" TODO を書く ")), "TODO を書く");
  assert.equal(compactPromptFor("pre", source("  "), undefined), null);
  assert.equal(compactPromptFor("pre", undefined, undefined), null);
  // オフにした分は、文が残っていても送らない（種類ごとに別）
  assert.equal(compactPromptFor("pre", source("メモを残す", false), source("TODO を書く")), "TODO を書く");
  assert.equal(compactPromptFor("pre", source("メモを残す", false), source("TODO を書く", false)), null);
  assert.equal(compactPromptFor("post", source("メモを残す", false), undefined), "あと");
});

test("圧縮後指示: 圧縮したことを前置きにして、指示の文をそのまま添える", () => {
  const message = postCompactMessage("memo.md を読み直す");
  assert.match(message, /^【圧縮後指示】会話を圧縮しました/);
  assert.ok(message.endsWith("---\nmemo.md を読み直す"));
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

test("サブエージェントについて聞く文: 宛先と添付の名前を前に置き、本文は区切りの後ろにそのまま。見分けると名前と本文が取れる（前の頭のものも）", () => {
  const message = subagentAskMessage("a1", "調査", "サブエージェントの記録-調査.md", "core には？\n2 行目");
  assert.ok(message.includes("「サブエージェントの記録-調査.md」"));
  assert.deepEqual(subagentAskOf(message), { name: "調査", text: "core には？\n2 行目" });
  assert.equal(subagentAskOf("ふつうの指示"), undefined);
  assert.deepEqual(subagentAskOf("【サブエージェントに直接聞く】「調査」（ID: a1）\n前置き\n---\n本文"), { name: "調査", text: "本文" });
});
