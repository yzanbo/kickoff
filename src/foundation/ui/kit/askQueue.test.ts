import assert from "node:assert/strict";
import { test } from "vitest";
import { finishAsk, pushAsk } from "./askQueue";

test("pushAsk・finishAsk: 開いている間の依頼は後ろに並び、閉じたら次が出る", () => {
  const first = { title: "確認" };
  const second = { title: "失敗" };
  let queue = pushAsk(pushAsk([], first), second);
  assert.equal(queue[0], first);
  queue = finishAsk(queue, first);
  assert.deepEqual(queue, [second]);
  // 同じ依頼をもう一度閉じても、次の依頼を落とさない
  assert.deepEqual(finishAsk(queue, first), [second]);
  assert.deepEqual(finishAsk(queue, second), []);
});
