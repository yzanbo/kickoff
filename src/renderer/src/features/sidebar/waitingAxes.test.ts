import assert from "node:assert/strict";
import { test } from "node:test";
import { WAITING_ORDERS, WAITING_SCOPES, waitingAxes, waitingViewOf } from "./waitingAxes";

test("waitingAxes: 今までの値はそのままの意味（絞る = 自分待ちだけ × プロジェクト別、1 列 = 自分待ちだけ × 状態順、上にまとめる = 上 × 状態順）", () => {
  assert.deepEqual(waitingAxes("filter"), { scope: "only", order: "project" });
  assert.deepEqual(waitingAxes("list"), { scope: "only", order: "status" });
  assert.deepEqual(waitingAxes("inbox"), { scope: "top", order: "status" });
  assert.deepEqual(waitingAxes("inbox-project"), { scope: "top", order: "project" });
});

test("waitingViewOf: 4 通りの組み合わせがそれぞれ別の値になり、軸に戻すと元の組み合わせ", () => {
  const views = new Set<string>();
  for (const scope of WAITING_SCOPES) {
    for (const order of WAITING_ORDERS) {
      const view = waitingViewOf(scope, order);
      views.add(view);
      assert.deepEqual(waitingAxes(view), { scope, order });
    }
  }
  assert.equal(views.size, 4);
});
