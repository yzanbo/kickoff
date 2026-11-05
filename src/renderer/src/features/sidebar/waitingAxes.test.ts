import assert from "node:assert/strict";
import { test } from "node:test";
import { canChooseOrder, WAITING_ORDERS, WAITING_SCOPES, waitingAxes, waitingViewOf } from "./waitingAxes";

test("waitingAxes: 今までの値はそのままの意味（絞る = 自分待ちだけ × プロジェクト別、1 列 = 自分待ちだけ × 状態順、上にまとめる = 上 × 状態順）", () => {
  assert.deepEqual(waitingAxes("filter"), { scope: "only", order: "project" });
  assert.deepEqual(waitingAxes("list"), { scope: "only", order: "status" });
  assert.deepEqual(waitingAxes("inbox"), { scope: "top", order: "status" });
  assert.deepEqual(waitingAxes("inbox-project"), { scope: "top", order: "project" });
});

test("waitingViewOf: 並べ方を選べる出し方の 4 通りがそれぞれ別の値になり、軸に戻すと元の組み合わせ", () => {
  const views = new Set<string>();
  for (const scope of WAITING_SCOPES.filter(canChooseOrder)) {
    for (const order of WAITING_ORDERS) {
      const view = waitingViewOf(scope, order);
      views.add(view);
      assert.deepEqual(waitingAxes(view), { scope, order });
    }
  }
  assert.equal(views.size, 4);
});

test("waitingViewOf: プロジェクト内の上には並べ方によらず 1 つ（プロジェクト別）", () => {
  assert.equal(waitingViewOf("project", "status"), "in-project");
  assert.equal(waitingViewOf("project", "project"), "in-project");
  assert.deepEqual(waitingAxes("in-project"), { scope: "project", order: "project" });
});
