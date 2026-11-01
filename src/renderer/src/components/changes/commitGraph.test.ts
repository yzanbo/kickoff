import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutGraph } from "./commitGraph";

test("一本道の履歴は、すべて 1 列目に並ぶ", () => {
  const { rows, lanes } = layoutGraph([
    { hash: "c", parents: ["b"] },
    { hash: "b", parents: ["a"] },
    { hash: "a", parents: [] },
  ]);
  assert.equal(lanes, 1);
  assert.deepEqual(rows.map((r) => r.col), [0, 0, 0]);
  assert.deepEqual(rows[2].bottom, []);
  // いちばん新しいコミット（ブランチの先頭）の上には線を引かない
  assert.deepEqual(rows[0].top, []);
  assert.deepEqual(rows[1].top.map((e) => [e.from, e.to]), [[0, 0]]);
});

test("枝分かれとマージ: マージの点から 2 本に分かれ、分かれたところで 1 本に戻る", () => {
  // m = マージ（親 b と x）、x は a から分かれたブランチ
  const { rows, lanes } = layoutGraph([
    { hash: "m", parents: ["b", "x"] },
    { hash: "x", parents: ["a"] },
    { hash: "b", parents: ["a"] },
    { hash: "a", parents: [] },
  ]);
  assert.equal(lanes, 2);
  assert.deepEqual(rows.map((r) => r.col), [0, 1, 0, 0]);
  // マージの点から、1 列目（b）と 2 列目（x）へ伸びる
  assert.deepEqual(rows[0].bottom.map((e) => [e.from, e.to]), [[0, 0], [0, 1]]);
  // x の親 a は 2 列目で待つ。b も a を待つので、b の行で 2 列目を 1 列目（本流）に合流させる
  assert.deepEqual(rows[2].bottom.map((e) => [e.from, e.to]), [[0, 0], [1, 0]]);
  assert.deepEqual(rows[3].top.map((e) => [e.from, e.to]), [[0, 0]]);
});
