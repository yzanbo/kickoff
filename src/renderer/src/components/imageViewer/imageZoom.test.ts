import assert from "node:assert/strict";
import { test } from "node:test";
import { canPan, clampView, fitScale, panBy, zoomTo } from "./imageZoom";

const stage = { width: 800, height: 600 };

test("画面に合わせた倍率: 大きな画像は収まるまで縮め、小さな画像は実寸のまま", () => {
  assert.equal(fitScale({ width: 1600, height: 600 }, stage), 0.5);
  assert.equal(fitScale({ width: 400, height: 1200 }, stage), 0.5);
  assert.equal(fitScale({ width: 200, height: 100 }, stage), 1);
  // 読み込む前（大きさ 0）は実寸
  assert.equal(fitScale({ width: 0, height: 0 }, stage), 1);
});

test("ずれは画像が画面の外へ逃げない範囲に収め、画面より小さい向きは中央に置く", () => {
  const natural = { width: 1000, height: 400 };
  assert.deepEqual(clampView({ scale: 1, x: 500, y: 50 }, natural, stage), { scale: 1, x: 100, y: 0 });
  assert.deepEqual(clampView({ scale: 1, x: -500, y: 0 }, natural, stage), { scale: 1, x: -100, y: 0 });
});

test("拡大・縮小: 指した点の下の画像は動かさず、倍率は上限・下限に収める", () => {
  const natural = { width: 800, height: 600 };
  // 右下を指して 2 倍にすると、その点が同じ位置に残る（中央から 200, 100 の点 → ずれ -200, -100）
  assert.deepEqual(zoomTo({ scale: 1, x: 0, y: 0 }, 2, { x: 200, y: 100 }, natural, stage), { scale: 2, x: -200, y: -100 });
  assert.equal(zoomTo({ scale: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }, natural, stage).scale, 8);
  assert.equal(zoomTo({ scale: 1, x: 0, y: 0 }, 0.01, { x: 0, y: 0 }, natural, stage).scale, 0.25);
  // 画面に合わせた大きさが下限より小さい画像は、そこまで縮められる
  assert.equal(zoomTo({ scale: 1, x: 0, y: 0 }, 0.01, { x: 0, y: 0 }, { width: 8000, height: 6000 }, stage).scale, 0.1);
  // 縮めて画面に収まったら中央に戻る
  assert.deepEqual(zoomTo({ scale: 2, x: -200, y: -100 }, 1, { x: 0, y: 0 }, natural, stage), { scale: 1, x: 0, y: 0 });
});

test("はみ出しているときだけずらせる", () => {
  const natural = { width: 800, height: 600 };
  assert.equal(canPan({ scale: 1, x: 0, y: 0 }, natural, stage), false);
  assert.equal(canPan({ scale: 1.5, x: 0, y: 0 }, natural, stage), true);
  assert.deepEqual(panBy({ scale: 2, x: 0, y: 0 }, 1000, -50, natural, stage), { scale: 2, x: 400, y: -50 });
});
