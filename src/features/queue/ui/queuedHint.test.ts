import assert from "node:assert/strict";
import { test } from "vitest";
import { relayMessage } from "@shared/chat/prompts";
import { isStopHint, nextQueuedText, queuedHint } from "./queuedHint";
import type { QueuedMessage } from "@shared/chat/types";

const noStops = { paused: false, stops: [] };
const line0 = { paused: false, stops: [0] };
const base = { busy: true, collapsed: false };

test("queuedHint: 次の指示の書き直しが終わるのを待っているときだけ、送信の準備ができたと伝える", () => {
  assert.equal(queuedHint(noStops, { ...base, busy: false, readyForEdit: true }), "次の指示の送信準備ができています。書き直しを保存すると送ります");
  // 作業中・送れなかったなど、書き直しを待っているのでなければ、いつもの案内
  assert.equal(queuedHint(noStops, base), "終わったら順に送ります");
  assert.equal(queuedHint(noStops, { ...base, busy: false }), "自動で送れませんでした。行の「すぐ送る」で送れます");
});

test("queuedHint: 作業が終わって 1 件目の上の線で待っているときは、止めているでも送れなかったでもなく、線を消すと続くと伝える", () => {
  assert.equal(queuedHint(line0, { ...base, busy: false }), "一時停止の線まで送りました。線を消すと続きを送ります");
  assert.equal(queuedHint(line0, { ...base, busy: false, collapsed: true }), "一時停止中");
  // 止めておくにしているときは、そちらを伝える
  assert.equal(queuedHint({ paused: true, stops: [0] }, { ...base, busy: false }), "止めています。行の「すぐ送る」で 1 件ずつ送れます");
});

test("nextQueuedText: 畳んだ 1 行の「次:」は挟む行の名前", () => {
  const row = (text: string, action?: "compact" | "clear"): QueuedMessage => ({ id: text, text, options: {}, attachments: [], created_at: "", ...(action ? { [action]: true } : {}) });
  assert.equal(nextQueuedText(row("", "compact")), "会話を圧縮");
  assert.equal(nextQueuedText(row("c", "clear")), "コンテキストを消去");
});

test("isStopHint: 作業中は印があれば、作業が終わったら 1 件目の上の線で待っているときだけ（止めている・書き直し・確かめの間は出さない）", () => {
  assert.equal(isStopHint({ paused: false, stops: [2] }, { busy: true }), true);
  assert.equal(isStopHint({ paused: false, stops: [2] }, { busy: false }), false);
  assert.equal(isStopHint(line0, { busy: false }), true);
  assert.equal(isStopHint({ paused: true, stops: [0] }, { busy: true }), false);
  assert.equal(isStopHint(line0, { busy: false, readyForEdit: true }), false);
  assert.equal(isStopHint(line0, { busy: false, held: true }), false);
});

test("nextQueuedText: サブエージェントに「あとで」伝える指示は、前置きを隠して宛先と本文の初めの行", () => {
  const relay: QueuedMessage = { id: "r", text: relayMessage("a1", "調べもの", "README も見て\n2 行目"), options: {}, attachments: [], created_at: "" };
  assert.equal(nextQueuedText(relay), "伝える → 調べもの: README も見て");
});

test("送信待ちの案内: 起動したときの確かめを待っている間は、決めるまで送らないことをほかより先に、短く伝える（詳しくは上の帯）", () => {
  assert.equal(queuedHint(noStops, { busy: false, collapsed: true, held: true }), "決めるまで送りません");
  assert.equal(queuedHint(line0, { busy: false, collapsed: false, held: true }), "決めるまで送りません");
});
