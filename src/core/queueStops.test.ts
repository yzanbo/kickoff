import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeStops, encodeStops, normalizeStops, remapStops } from "./queueStops.js";
import type { QueuedMessage } from "./types.js";

const m = (id: string) => ({ id }) as QueuedMessage;
const [a, b, c, d] = ["a", "b", "c", "d"].map(m);

test("印の位置: 列の長さに収め、重なりを除いて小さい順に", () => {
  assert.deepEqual(normalizeStops([3, 0, 9, 3, 1.5, -1], 4), [0, 3, 4]);
});

test("印の位置: 並べ替えでは動かず、前の指示を送った・消した・まとめた分だけ上に寄る", () => {
  // 並べ替え
  assert.deepEqual(remapStops([a, b, c, d], [d, c, b, a], [0, 2, 4]), [0, 2, 4]);
  // 先頭を送った: 2 件目のあと → 1 件目のあと、1 件目の上はそのまま
  assert.deepEqual(remapStops([a, b, c], [b, c], [0, 2]), [0, 1]);
  // 印より後ろを消しても動かない
  assert.deepEqual(remapStops([a, b, c], [a, b], [1]), [1]);
  // まとめた（b と c を b にまとめた）: 3 件目のあと → 2 件目のあと
  assert.deepEqual(remapStops([a, b, c, d], [a, b, d], [3]), [2]);
  // すべて送った: 最後のあとの印は、列の上（次に来た指示の前）に残る
  assert.deepEqual(remapStops([a], [], [1]), [0]);
});

test("印の保存: 位置の配列で書き、印を指示に付けていたころの形（ID・ID の配列）も読める", () => {
  assert.equal(encodeStops([]), null);
  assert.equal(encodeStops([0, 2]), "[0,2]");
  assert.deepEqual(decodeStops("[0,2]", [a, b, c]), [0, 2]);
  assert.deepEqual(decodeStops("b", [a, b, c]), [2]);
  assert.deepEqual(decodeStops('["a","c"]', [a, b, c]), [1, 3]);
  assert.deepEqual(decodeStops('["gone"]', [a]), []);
  assert.deepEqual(decodeStops("[broken", [a]), []);
  assert.deepEqual(decodeStops(null, [a]), []);
});
