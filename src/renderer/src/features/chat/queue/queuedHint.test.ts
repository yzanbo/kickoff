import assert from "node:assert/strict";
import { test } from "node:test";
import { nextQueuedText, queuedHint, reservedCompact } from "./queuedHint";
import type { QueuedMessage } from "@shared/types";

const base = { paused: false, busy: true, collapsed: false, stopIndex: -1 };

test("queuedHint: 次の指示の書き直しが終わるのを待っているときだけ、送信の準備ができたと伝える", () => {
  assert.equal(queuedHint({ ...base, busy: false, readyForEdit: true }), "次の指示の送信準備ができています。書き直しを保存すると送ります");
  // 作業中・送れなかったなど、書き直しを待っているのでなければ、いつもの案内
  assert.equal(queuedHint(base), "終わったら順に送ります");
  assert.equal(queuedHint({ ...base, busy: false }), "自動で送れませんでした。行の「すぐ送る」で送れます");
});

test("reservedCompact: いちばん上の圧縮の行で、その上で止めていないときだけ予約とみなす。畳んだ 1 行の「次:」は「会話を圧縮」", () => {
  const row = (text: string, compact = false): QueuedMessage => ({ id: text, text, options: {}, attachments: [], created_at: "", ...(compact ? { compact } : {}) });
  const compact = row("", true);
  const queue = { messages: [compact, row("2")], paused: false, stops: [], waiting_edit: false };
  assert.equal(reservedCompact(queue), compact);
  assert.equal(reservedCompact({ ...queue, paused: true }), null);
  assert.equal(reservedCompact({ ...queue, stops: [0] }), null);
  assert.equal(reservedCompact({ ...queue, messages: [row("2"), compact] }), null);
  assert.equal(nextQueuedText(compact), "会話を圧縮");
});
