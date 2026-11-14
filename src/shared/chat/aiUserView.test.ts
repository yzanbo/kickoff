import assert from "node:assert/strict";
import { test } from "node:test";
import { userViewSummaryLine, userViewSummaryOf } from "./aiUserView";

test("userViewSummaryOf: 結果の 1 行目の［…］を記録の行の文にする（なければ null）", () => {
  assert.equal(userViewSummaryOf(`${userViewSummaryLine("画面を見ました（エディタ: a.ts）")}\n本文`), "画面を見ました（エディタ: a.ts）");
  assert.equal(userViewSummaryOf("本文だけ"), null);
  assert.equal(userViewSummaryOf(undefined), null);
});
