import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, LABEL_TEXT_DARK, LABEL_TEXT_LIGHT, parseColor, readableLabelColor } from "./labelContrast";

test("#rgb・#rrggbb・rgb()・rgba() を読み、透明と読めない色は null にする", () => {
  assert.deepEqual(parseColor("#fff"), [255, 255, 255]);
  assert.deepEqual(parseColor("#F0FDF4"), [240, 253, 244]);
  assert.deepEqual(parseColor("rgb(17, 17, 17)"), [17, 17, 17]);
  assert.deepEqual(parseColor("rgba(1, 2, 3, 0.5)"), [1, 2, 3]);
  assert.deepEqual(parseColor("rgb(1 2 3 / 50%)"), [1, 2, 3]);
  assert.equal(parseColor("rgba(0, 0, 0, 0)"), null);
  assert.equal(parseColor("none"), null);
  assert.equal(parseColor("url(#grad)"), null);
});

test("明暗差は白と黒で 21、同じ色で 1", () => {
  assert.equal(contrastRatio("#000", "#fff"), 21);
  assert.equal(contrastRatio("#777", "#777"), 1);
  assert.equal(contrastRatio("none", "#fff"), null);
});

test("ダークで明るい塗りだけを指定した箱（白い文字）は、暗い文字に替える", () => {
  assert.equal(readableLabelColor("#f0fdf4", "rgb(250, 250, 250)"), LABEL_TEXT_DARK);
});

test("ライトで暗い塗りだけを指定した箱（黒い文字）は、明るい文字に替える", () => {
  assert.equal(readableLabelColor("#1e3a8a", "rgb(31, 35, 40)"), LABEL_TEXT_LIGHT);
});

test("読める組み合わせ・色が読めないときは替えない", () => {
  assert.equal(readableLabelColor("#f0fdf4", "#111111"), null);
  assert.equal(readableLabelColor("#262626", "rgb(250, 250, 250)"), null);
  assert.equal(readableLabelColor("none", "#fff"), null);
});
