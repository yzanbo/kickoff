import assert from "node:assert/strict";
import { test } from "node:test";
import { queuedHint } from "./queuedHint";

const base = { paused: false, busy: true, collapsed: false, stopIndex: -1 };

test("queuedHint: 次の指示の書き直しが終わるのを待っているときだけ、送信の準備ができたと伝える", () => {
  assert.equal(queuedHint({ ...base, busy: false, readyForEdit: true }), "次の指示の送信準備ができています。書き直しを保存すると送ります");
  // 作業中・送れなかったなど、書き直しを待っているのでなければ、いつもの案内
  assert.equal(queuedHint(base), "終わったら順に送ります");
  assert.equal(queuedHint({ ...base, busy: false }), "自動で送れませんでした。行の「すぐ送る」で送れます");
});
