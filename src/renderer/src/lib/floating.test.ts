import assert from "node:assert/strict";
import { test } from "node:test";
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
