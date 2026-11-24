import assert from "node:assert/strict";
import { test } from "vitest";
import { placeFloating } from "./floating";

const viewport = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };
const button = (left: number, top: number, width = 80, height = 24) => ({ left, top, right: left + width, bottom: top + height });

test("placeFloating: 点なら左上をそこに置き、入らなければ左・上へ寄せる（画面の端から 8px 空ける）", () => {
  assert.deepEqual(placeFloating({ x: 100, y: 120 }, menu, viewport), { left: 100, top: 120 });
  assert.deepEqual(placeFloating({ x: 950, y: 700 }, menu, viewport), { left: 792, top: 492 });
  // 画面の端より外を押しても（キーボードで開いたときの 0, 0 など）、端から空ける
  assert.deepEqual(placeFloating({ x: 0, y: 0 }, menu, viewport), { left: 8, top: 8 });
});

test("placeFloating: 画面より大きければ、上・左の端にそろえる", () => {
  assert.deepEqual(placeFloating({ x: 300, y: 300 }, { width: 1200, height: 900 }, viewport), { left: 8, top: 8 });
});

test("placeFloating: 基準の要素の下に、左端（end なら右端）をそろえて置く", () => {
  const anchor = button(300, 100);
  assert.deepEqual(placeFloating({ anchor }, menu, viewport), { left: 300, top: 128 });
  assert.deepEqual(placeFloating({ anchor, align: "end", gap: 6 }, menu, viewport), { left: 180, top: 130 });
  // 右の端に入らなければ左へ寄せる
  assert.deepEqual(placeFloating({ anchor: button(900, 100) }, menu, viewport), { left: 792, top: 128 });
});

test("placeFloating: 下に入らなければ上に出し、above は上を先に試す", () => {
  // 画面の下のほうのボタン（チャット欄の近く）
  const low = button(300, 700);
  assert.deepEqual(placeFloating({ anchor: low }, menu, viewport), { left: 300, top: 396 });
  assert.deepEqual(placeFloating({ anchor: low, side: "above", gap: 8 }, menu, viewport), { left: 300, top: 392 });
  // 上に入らなければ下に出す
  const high = button(300, 40);
  assert.deepEqual(placeFloating({ anchor: high, side: "above" }, menu, viewport), { left: 300, top: 68 });
});

test("placeFloating: 上にも下にも入らなければ、広い方に出して画面の中へ寄せる", () => {
  const tall = { width: 200, height: 700 };
  // 下の方が広い
  assert.deepEqual(placeFloating({ anchor: button(300, 200), side: "above" }, tall, viewport), { left: 300, top: 92 });
  // 上の方が広い
  assert.deepEqual(placeFloating({ anchor: button(300, 600) }, tall, viewport), { left: 300, top: 8 });
});

test("placeFloating: right / left は横に出し（入らなければ反対側）、align で上端・下端・真ん中をそろえる", () => {
  const item = button(300, 100, 200, 30);
  // 右（子のメニュー）: 上端をそろえる
  assert.deepEqual(placeFloating({ anchor: item, side: "right" }, menu, viewport), { left: 504, top: 100 });
  // 右に入らなければ左
  assert.deepEqual(placeFloating({ anchor: button(700, 100, 200, 30), side: "right" }, menu, viewport), { left: 496, top: 100 });
  // 左（右端の縦の列の説明）: 縦の真ん中
  assert.deepEqual(placeFloating({ anchor: item, side: "left", align: "center", gap: 8 }, { width: 100, height: 40 }, viewport), { left: 192, top: 95 });
  // 下の端に入らなければ上へ寄せる
  assert.deepEqual(placeFloating({ anchor: button(300, 700, 200, 30), side: "right" }, menu, viewport), { left: 504, top: 492 });
});

test("placeFloating: 上下に出すときの center は横の真ん中（説明）", () => {
  assert.deepEqual(placeFloating({ anchor: button(300, 400, 80, 24), side: "above", align: "center", gap: 8 }, { width: 120, height: 30 }, viewport), { left: 280, top: 362 });
  // 画面の左の端では寄せる
  assert.deepEqual(placeFloating({ anchor: button(0, 400, 40, 24), side: "above", align: "center", gap: 8 }, { width: 120, height: 30 }, viewport), { left: 8, top: 362 });
});
