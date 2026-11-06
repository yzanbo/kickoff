import assert from "node:assert/strict";
import { test } from "node:test";
import { adjacentPrompt, promptAround } from "./promptNav";

test("指示のあいだを移る: 前は上端より上のいちばん下（描いていない前の発言も上）、次は上端より下のいちばん上", () => {
  const ids = [1, 2, 3, 4];
  // 1 は窓の外（描いていない）、2 は上に流れた、3 はちょうど上端、4 は下
  const tops = new Map([
    [2, -300],
    [3, 2],
    [4, 500],
  ]);
  assert.equal(adjacentPrompt(ids, tops, -1), 2);
  assert.equal(adjacentPrompt(ids, tops, 1), 4);
  // いちばん上・いちばん下
  assert.equal(adjacentPrompt([5], new Map([[5, 100]]), -1), undefined);
  assert.equal(adjacentPrompt([5], new Map([[5, -100]]), 1), undefined);
});

test("前に移った先がまだ見えていれば、その前後へ（いちばん下で上端まで送れない指示でも先へ進める）", () => {
  const ids = [1, 2, 3];
  const tops = new Map([
    [1, 100],
    [2, 300],
    [3, 500],
  ]);
  assert.equal(adjacentPrompt(ids, tops, 1, 2), 3);
  assert.equal(adjacentPrompt(ids, tops, -1, 2), 1);
  assert.equal(adjacentPrompt(ids, tops, 1, 3), undefined);
  // 前に移った先が一覧にない（消えた）ときは位置で決める
  assert.equal(adjacentPrompt(ids, tops, 1, 9), 1);
});

test("貼り付けたものの前後の指示: 指示ならその隣、質問への回答なら記録の順で前後のいちばん近い指示", () => {
  const ids = [3, 7, 12];
  assert.equal(promptAround(ids, 7, -1), 3);
  assert.equal(promptAround(ids, 7, 1), 12);
  assert.equal(promptAround(ids, 3, -1), undefined);
  // 9 は 7 と 12 の間の回答
  assert.equal(promptAround(ids, 9, -1), 7);
  assert.equal(promptAround(ids, 9, 1), 12);
  // 指示より前・後ろの回答
  assert.equal(promptAround(ids, 1, -1), undefined);
  assert.equal(promptAround(ids, 20, 1), undefined);
  assert.equal(promptAround(ids, 20, -1), 12);
});
