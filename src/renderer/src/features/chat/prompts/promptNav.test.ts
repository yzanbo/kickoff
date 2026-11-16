import assert from "node:assert/strict";
import { test } from "vitest";
import { adjacentPrompt, promptAround, promptTops } from "./promptNav";

test("指示のあいだを移る: 前は上端より上のいちばん下、次は上端より下のいちばん上", () => {
  const ids = [1, 2, 3, 4];
  // 1 は読み込んだ範囲の前、2 は上に流れた、3 はちょうど上端、4 は下
  const tops = new Map([
    [1, -Infinity],
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

test("promptTops: 窓の位置（描いていない行も前からの和）を使い、読み込んだ範囲の外の指示は前なら上・後ろなら下とみなす", () => {
  const ids = [3, 10, 20, 30, 40];
  // 10 は上の箱の中（前からの和で -2000）、20 は見えている、30 は下の箱の中（+3000）。3 は範囲の前、40 は途中の一部分の後ろ
  const positions = new Map([
    [10, -2000],
    [20, 100],
    [30, 3000],
  ]);
  const tops = promptTops(ids, (id) => positions.get(id), { first: 5, last: 35 });
  assert.equal(tops.get(3), -Infinity);
  assert.equal(tops.get(40), Infinity);
  assert.equal(tops.get(30), 3000);
  // 上を読んでいるとき、⌘⌥↑ は下の箱の指示（30）や最新（40）へ跳ばず、上の箱の指示（10）へ
  assert.equal(adjacentPrompt(ids, tops, -1), 10);
  // ⌘⌥↓ は次の指示（20）。その次は下の箱の中の 30
  assert.equal(adjacentPrompt(ids, tops, 1), 20);
  assert.equal(adjacentPrompt(ids, new Map([...tops, [20, -50]]), 1), 30);
  // 流れに何も出していなければ、位置は持たない（選ばない）
  assert.equal(promptTops(ids, () => undefined, null).size, 0);
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
