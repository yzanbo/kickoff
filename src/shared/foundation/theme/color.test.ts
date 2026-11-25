import assert from "node:assert/strict";
import { test } from "vitest";
import { blendRgb, contrastRatio, parseColor } from "./color";

test("#rgb・#rrggbb・rgb()・rgba() を読み、透明と読めない色は null にする", () => {
  assert.deepEqual(parseColor("#fff"), { rgb: [255, 255, 255], alpha: 1 });
  assert.deepEqual(parseColor("#F0FDF4"), { rgb: [240, 253, 244], alpha: 1 });
  assert.deepEqual(parseColor("rgb(17, 17, 17)"), { rgb: [17, 17, 17], alpha: 1 });
  assert.deepEqual(parseColor("rgba(1, 2, 3, 0.5)"), { rgb: [1, 2, 3], alpha: 0.5 });
  assert.deepEqual(parseColor("rgb(1 2 3 / 50%)"), { rgb: [1, 2, 3], alpha: 0.5 });
  assert.equal(parseColor("rgba(0, 0, 0, 0)"), null);
  assert.equal(parseColor("none"), null);
  assert.equal(parseColor("url(#grad)"), null);
});

test("明暗差は白と黒で 21、同じ色で 1", () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(contrastRatio([119, 119, 119], [119, 119, 119]), 1);
});

test("色を半透明で重ねる", () => {
  assert.deepEqual(blendRgb([255, 255, 255], 0.5, [0, 0, 0]), [128, 128, 128]);
  assert.deepEqual(blendRgb([10, 20, 30], 1, [0, 0, 0]), [10, 20, 30]);
});
