import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EDGE_MAX_STEP_PX, edgeScrollStep } from "./edgeScroll";

test("ドラッグ中の端のスクロール: 真ん中では動かず、上の端の帯では戻し、下の端の帯では進める", () => {
  assert.equal(edgeScrollStep(250, 0, 500), 0);
  assert.ok(edgeScrollStep(10, 0, 500) < 0);
  assert.ok(edgeScrollStep(490, 0, 500) > 0);
});

test("ドラッグ中の端のスクロール: 端に近いほど速く、いちばん端（と外）で最大、帯に入ったばかりでも 1 は動く", () => {
  assert.equal(edgeScrollStep(0, 0, 500), -EDGE_MAX_STEP_PX);
  assert.equal(edgeScrollStep(-30, 0, 500), -EDGE_MAX_STEP_PX);
  assert.equal(edgeScrollStep(500, 0, 500), EDGE_MAX_STEP_PX);
  assert.ok(Math.abs(edgeScrollStep(5, 0, 500)) > Math.abs(edgeScrollStep(30, 0, 500)));
  assert.equal(edgeScrollStep(47, 0, 500), -1);
});

test("ドラッグ中の端のスクロール: 小さな欄では帯を 4 分の 1 までにして、真ん中では動かさない", () => {
  assert.equal(edgeScrollStep(50, 0, 100), 0);
  assert.ok(edgeScrollStep(20, 0, 100) < 0);
  assert.equal(edgeScrollStep(30, 0, 100), 0);
  assert.equal(edgeScrollStep(5, 0, 0), 0);
});
