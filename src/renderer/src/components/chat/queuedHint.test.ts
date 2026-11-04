import assert from "node:assert/strict";
import { test } from "node:test";
import { queuedHint } from "./queuedHint";

const base = { paused: false, busy: true, collapsed: false, stopIndex: -1 };

test("queuedHint: 次の指示を書き直している間は送らないことを伝え、作業が終わったら送信の準備ができたと伝える", () => {
  assert.equal(queuedHint({ ...base, editingNext: true }), "1 件目の書き直しが終わるまで、次は送りません");
  assert.equal(queuedHint({ ...base, busy: false, editingNext: true, ready: true }), "次の指示の送信準備ができています。書き直しを保存すると送ります");
  // 書き直しを待っているのでなく、送れなかったなどで止まっているときは、いつもの案内
  assert.equal(queuedHint({ ...base, busy: false, editingNext: true }), "自動で送れませんでした。行の「すぐ送る」で送れます");
  // 止めている・1 件目の上で一時停止するときは、書き直しに関係なく止まるので、いつもの案内
  assert.equal(queuedHint({ ...base, paused: true, editingNext: true }), "終わっても送らずに止めておきます");
  assert.equal(queuedHint({ ...base, stopIndex: 0, editingNext: true }), "終わっても送らずに一時停止します（1 件目の上に一時停止）");
  // 書き直していなければ、これまでどおり
  assert.equal(queuedHint(base), "終わったら順に送ります");
  assert.equal(queuedHint({ ...base, busy: false }), "自動で送れませんでした。行の「すぐ送る」で送れます");
});
