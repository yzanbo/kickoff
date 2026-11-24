// 作業の終わりの引き継ぎの行き先（届いた・受信不明・送る前に止まった）
import assert from "node:assert/strict";
import { test } from "vitest";
import { handoffAfterTurn } from "./providerHandoffs";

test("引き継ぎの行き先: 送ったあとは届いたか受信不明、送る前に止まったら再試行待ち（記録した指示の送り直しかで分ける）", () => {
  assert.equal(handoffAfterTurn({ sent: true, completed: true, resend: false }), "complete");
  assert.equal(handoffAfterTurn({ sent: true, completed: false, resend: true }), "uncertain");
  assert.equal(handoffAfterTurn({ sent: false, completed: true, resend: true }), "block_before_send");
  assert.equal(handoffAfterTurn({ sent: false, completed: false, resend: false }), "block_ready");
});
