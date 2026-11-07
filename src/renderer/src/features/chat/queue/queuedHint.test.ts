import assert from "node:assert/strict";
import { test } from "node:test";
import { nextQueuedText, queuedHint, reservedAction } from "./queuedHint";
import type { QueuedMessage } from "@shared/types";

const base = { paused: false, busy: true, collapsed: false, stopIndex: -1 };

test("queuedHint: 次の指示の書き直しが終わるのを待っているときだけ、送信の準備ができたと伝える", () => {
  assert.equal(queuedHint({ ...base, busy: false, readyForEdit: true }), "次の指示の送信準備ができています。書き直しを保存すると送ります");
  // 作業中・送れなかったなど、書き直しを待っているのでなければ、いつもの案内
  assert.equal(queuedHint(base), "終わったら順に送ります");
  assert.equal(queuedHint({ ...base, busy: false }), "自動で送れませんでした。行の「すぐ送る」で送れます");
});

test("queuedHint: 作業が終わって 1 件目の上の線で待っているときは、止めているでも送れなかったでもなく、線を消すと続くと伝える", () => {
  assert.equal(queuedHint({ ...base, busy: false, stopIndex: 0 }), "一時停止の線まで送りました。線を消すと続きを送ります");
  assert.equal(queuedHint({ ...base, busy: false, stopIndex: 0, collapsed: true }), "一時停止中");
  // 止めておくにしているときは、そちらを伝える
  assert.equal(queuedHint({ ...base, busy: false, stopIndex: 0, paused: true }), "止めています。行の「すぐ送る」で 1 件ずつ送れます");
});

test("reservedAction: いちばん上の圧縮・消去の行で、その上で止めていないときだけ予約とみなす。畳んだ 1 行の「次:」は「会話を圧縮」", () => {
  const row = (text: string, action?: "compact" | "clear"): QueuedMessage => ({ id: text, text, options: {}, attachments: [], created_at: "", ...(action ? { [action]: true } : {}) });
  const compact = row("", "compact");
  const queue = { messages: [compact, row("2")], paused: false, stops: [], waiting_edit: false };
  assert.equal(reservedAction(queue), compact);
  assert.equal(reservedAction({ ...queue, paused: true }), null);
  assert.equal(reservedAction({ ...queue, stops: [0] }), null);
  assert.equal(reservedAction({ ...queue, messages: [row("2"), compact] }), null);
  const clear = row("c", "clear");
  assert.equal(reservedAction({ ...queue, messages: [clear, compact] }), clear);
  assert.equal(nextQueuedText(compact), "会話を圧縮");
});

test("reservedAction: いちばん上がコンテキストの消去の行なら、消去の予約。畳んだ 1 行の「次:」は「コンテキストを消去」", () => {
  const clear: QueuedMessage = { id: "c", text: "", options: {}, attachments: [], created_at: "", clear: true };
  assert.equal(reservedAction({ messages: [clear], paused: false, stops: [], waiting_edit: false }), clear);
  assert.equal(nextQueuedText(clear), "コンテキストを消去");
});

test("送信待ちの案内: 起動したときの確かめを待っている間は、決めるまで送らないことをほかより先に、短く伝える（詳しくは上の帯）", () => {
  assert.equal(queuedHint({ paused: false, busy: false, collapsed: true, stopIndex: -1, held: true }), "決めるまで送りません");
  assert.equal(queuedHint({ paused: false, busy: false, collapsed: false, stopIndex: 0, held: true }), "決めるまで送りません");
});
