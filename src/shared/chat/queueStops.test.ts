import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeStops, encodeStops, moveToSlot, normalizeStops, remapStops } from "@shared/chat/queueStops";
import type { QueuedMessage } from "@shared/types";

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

// 見た目の並び（"|" が印の線）にして比べる
const view = ({ list, stops }: { list: QueuedMessage[]; stops: number[] }) =>
  list.flatMap((x, i) => [...(stops.includes(i) ? ["|"] : []), x.id]).concat(stops.includes(list.length) ? ["|"] : []).join(" ");

test("指示を動かす: 動かした指示だけが印の線の上下を移り、ほかの指示は線の同じ側に残る", () => {
  const list = [a, b, c, d];
  // a b | c d から、d をいちばん上へ（線の上）: b は線の上のまま
  assert.equal(view(moveToSlot(list, [2], ["d"], { at: 0, belowStop: true })), "d a b | c");
  // a をいちばん下へ（線の下）: c は線の下のまま
  assert.equal(view(moveToSlot(list, [2], ["a"], { at: 4, belowStop: false })), "b | c d a");
  // 線のすぐ上（c の前・線の上）に d を落とす → 線の上へ
  assert.equal(view(moveToSlot(list, [2], ["d"], { at: 2, belowStop: false })), "a b d | c");
  // 線のすぐ下（c の前・線の下）に a を落とす → 線の下へ
  assert.equal(view(moveToSlot(list, [2], ["a"], { at: 2, belowStop: true })), "b | a c d");
  // 線をまたがない並べ替えでは、線は動かない
  assert.equal(view(moveToSlot(list, [2], ["b"], { at: 0, belowStop: true })), "b a | c d");
  // 1 件目の上の線・いちばん下の線は、いちばん上・下へ移しても端に残る
  assert.equal(view(moveToSlot(list, [0, 4], ["c"], { at: 0, belowStop: true })), "| c a b d |");
  assert.equal(view(moveToSlot(list, [0, 4], ["b"], { at: 4, belowStop: false })), "| a c d b |");
  // まとめて動かす（並びは列の順のまま）: b と d を線の下の先頭へ
  assert.equal(view(moveToSlot(list, [2], ["d", "b"], { at: 2, belowStop: true })), "a | b d c");
  // 動かす指示の位置に落とす（選んだものの中）: そのすき間に並べ直す（a | b c | d → c は 2 本の線のあいだに残る）
  assert.equal(view(moveToSlot(list, [1, 3], ["b", "d"], { at: 1, belowStop: true })), "a | b d c |");
  // 線のあいだの指示をすべて抜くと、線は 1 本にまとまる
  assert.equal(view(moveToSlot(list, [1, 2], ["b"], { at: 4, belowStop: false })), "a | c d b");
  // 動かす指示がなければそのまま
  assert.equal(view(moveToSlot(list, [2], ["x"], { at: 0, belowStop: true })), "a b | c d");
});
