import assert from "node:assert/strict";
import { test } from "node:test";
import { blend, colorBehind, contrastRatio, LABEL_TEXT_DARK, LABEL_TEXT_LIGHT, onLayer, parseColor, readableLabelColor, readableStrokeColor, type Layer, type Rgb } from "./labelContrast";

const WHITE: Rgb = [250, 250, 250];
const BLACK: Rgb = [26, 26, 30];
const DARK_BG: Rgb = [24, 24, 27];

const layer = (left: number, top: number, right: number, bottom: number, color: string): Layer => ({
  box: { left, top, right, bottom },
  color: parseColor(color)!,
});

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
  assert.deepEqual(blend([255, 255, 255], 0.5, [0, 0, 0]), [128, 128, 128]);
  assert.deepEqual(blend([10, 20, 30], 1, [0, 0, 0]), [10, 20, 30]);
});

test("点の下の色: どの形にも含まれなければ地の色、重なっていれば上の不透明な形の色", () => {
  const layers = [layer(0, 0, 100, 100, "#f0fdf4"), layer(10, 10, 50, 50, "#1e3a8a")];
  assert.deepEqual(colorBehind(200, 200, layers, DARK_BG), DARK_BG);
  assert.deepEqual(colorBehind(80, 80, layers, DARK_BG), [240, 253, 244]);
  assert.deepEqual(colorBehind(30, 30, layers, DARK_BG), [30, 58, 138]);
});

test("点の下の色: 半透明の形は、下の形の色に重ねる", () => {
  const layers = [layer(0, 0, 100, 100, "#ffffff"), layer(0, 0, 100, 100, "rgba(0, 0, 0, 0.5)")];
  assert.deepEqual(colorBehind(50, 50, layers, DARK_BG), [128, 128, 128]);
});

test("ダークで明るい塗り（白い文字）は暗い文字に、ライトで暗い塗り（黒い文字）は明るい文字に替える", () => {
  assert.equal(readableLabelColor([240, 253, 244], WHITE), LABEL_TEXT_DARK);
  assert.equal(readableLabelColor([30, 58, 138], BLACK), LABEL_TEXT_LIGHT);
});

test("ダークの地に暗い文字色だけを指定した線のラベルは、明るい文字に替える", () => {
  assert.equal(readableLabelColor(DARK_BG, [17, 17, 17]), LABEL_TEXT_LIGHT);
});

test("読める組み合わせは替えない", () => {
  assert.equal(readableLabelColor([240, 253, 244], [17, 17, 17]), null);
  assert.equal(readableLabelColor([38, 38, 38], WHITE), null);
});

test("readableStrokeColor: 明るい塗りの上の白い線は暗い色に、見える線はそのまま、通る所すべてでいちばん見える色を選ぶ", () => {
  const PALE_BLUE: Rgb = [232, 240, 254];
  // ダークのテーマの白い線が、明るい青の塗り（シーケンス図の rect）の上を通る
  assert.equal(readableStrokeColor([PALE_BLUE, PALE_BLUE], WHITE), LABEL_TEXT_DARK);
  // 暗い地の上の白い線・明るい地の上の黒い線は替えない
  assert.equal(readableStrokeColor([DARK_BG], WHITE), null);
  assert.equal(readableStrokeColor([PALE_BLUE], BLACK), null);
  // 暗い塗りの上の黒い線は明るい色に
  assert.equal(readableStrokeColor([DARK_BG, DARK_BG], BLACK), LABEL_TEXT_LIGHT);
  // 通る所がなければ替えない
  assert.equal(readableStrokeColor([], WHITE), null);
});

test("onLayer: 点が塗った形のどれかの上にあるか", () => {
  const layers = [layer(0, 0, 10, 10, "#e8f0fe")];
  assert.equal(onLayer(5, 5, layers), true);
  assert.equal(onLayer(20, 5, layers), false);
  assert.equal(onLayer(5, 5, []), false);
});
