import assert from "node:assert/strict";
import { test } from "vitest";
import { afterCompactLabelOf } from "./afterCompactLabel";

test("afterCompactLabelOf: 圧縮を待っている指示の文の 5 つの場合（圧縮後指示か・圧縮後指示があるかで分ける）", () => {
  // 圧縮が終わるのを待っている
  assert.equal(afterCompactLabelOf("compact", true, true), "圧縮が終わったら、最初に送ります");
  assert.equal(afterCompactLabelOf("compact", false, true), "圧縮後指示のやり取りが終わったら送ります");
  assert.equal(afterCompactLabelOf("compact", false, false), "圧縮のあとのやり取りが終わったら送ります");
  // 圧縮のあとのやり取りの途中（圧縮後指示はいまの作業に入っている）
  assert.equal(afterCompactLabelOf("exchange", false, true), "このやり取りが終わったら送ります");
  assert.equal(afterCompactLabelOf("exchange", true, true), "いまの作業に伝えます");
  // いまの作業に足せなくなった
  assert.equal(afterCompactLabelOf("closed", true, true), "この作業が終わったら、最初に送ります");
  assert.equal(afterCompactLabelOf("closed", false, false), "この作業が終わったら送ります");
  // 圧縮を待たずに残っている（作業中 / 作業していない）
  assert.equal(afterCompactLabelOf("turn", false, false), "いまの作業に伝えます");
  assert.equal(afterCompactLabelOf("next", true, true), "次に送る指示と一緒に伝えます");
});
