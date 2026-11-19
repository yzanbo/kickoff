import assert from "node:assert/strict";
import { test } from "vitest";
import { acceptRowSize, boxHeight, buildMetrics, indexAt, keepRange, rangeFor, releasable, runsOf } from "./rowLayout";

test("buildMetrics: 前からの和に gap を入れ、高さ 0 の行には gap を数えない", () => {
  const m = buildMetrics([100, 0, 50, 20], 4);
  assert.deepEqual([...m.offsets], [0, 104, 104, 158, 182]);
});

test("indexAt: 境目（ちょうど上端・下端）と範囲の外", () => {
  const m = buildMetrics([100, 50, 20], 4);
  // 行の上端: 0・104・158
  assert.equal(indexAt(m, 0), 0);
  assert.equal(indexAt(m, 103.9), 0);
  assert.equal(indexAt(m, 104), 1);
  assert.equal(indexAt(m, 157), 1);
  assert.equal(indexAt(m, 158), 2);
  assert.equal(indexAt(m, -50), 0);
  assert.equal(indexAt(m, 99999), 2);
  assert.equal(indexAt(buildMetrics([], 4), 10), 0);
});

test("rangeFor: 見えている所と上下の余裕を含む", () => {
  const m = buildMetrics(Array(100).fill(96), 4);
  // 行は 100px ごと。見えている所は 1000〜1500
  assert.deepEqual(rangeFor(m, { top: 1000, height: 500 }, 0, 0), { start: 10, end: 16 });
  assert.deepEqual(rangeFor(m, { top: 1000, height: 500 }, 300, 600), { start: 7, end: 22 });
  // 端は切る
  assert.deepEqual(rangeFor(m, { top: 0, height: 500 }, 600, 99999), { start: 0, end: 100 });
  assert.deepEqual(rangeFor(buildMetrics([], 4), { top: 0, height: 500 }, 0, 0), { start: 0, end: 0 });
});

test("boxHeight: 箱で置き換えても、下の行の位置は全部描いたときと同じ", () => {
  const heights = [100, 0, 50, 30, 20];
  const gap = 4;
  const m = buildMetrics(heights, gap);
  // 全部描いたとき、行 4 の上端は offsets[4]
  // 行 0〜3 を箱にすると: 箱の高さ ＋ 箱の後ろの gap が行 4 の上端
  assert.equal(boxHeight(m, 0, 4) + gap, m.offsets[4]);
  // 行 1〜3 を箱にすると: 行 0 ＋ gap ＋ 箱 ＋ gap
  assert.equal(100 + gap + boxHeight(m, 1, 4) + gap, m.offsets[4]);
  // 高さ 0 の行だけの箱は 0（置かない）
  assert.equal(boxHeight(m, 1, 2), 0);
});

test("runsOf: 離れた描く行の間を箱にし、高さ 0 の箱は置かない", () => {
  const m = buildMetrics([10, 10, 0, 10, 10, 10], 4);
  assert.deepEqual(runsOf(m, new Set([0, 1, 4])), [
    { kind: "rows", start: 0, end: 2 },
    { kind: "box", start: 2, end: 4, height: 10 },
    { kind: "rows", start: 4, end: 5 },
    { kind: "box", start: 5, end: 6, height: 10 },
  ]);
  // 箱の中が高さ 0 の行だけなら箱を置かない
  assert.deepEqual(runsOf(m, new Set([0, 1, 3, 4, 5])), [
    { kind: "rows", start: 0, end: 2 },
    { kind: "rows", start: 3, end: 6 },
  ]);
  assert.deepEqual(runsOf(m, new Set()), [{ kind: "box", start: 0, end: 6, height: 10 * 5 + 4 * 4 }]);
});

test("releasable: 遠くて長く見ていない行だけを外し、範囲の中・近い行・最近見た行・残す印の行は外さない", () => {
  const m = buildMetrics(Array(200).fill(96), 4);
  const view = { top: 10000, height: 500 };
  const range = rangeFor(m, view, 600, 600);
  const lastSeen = new Map([[3, 9000]]);
  const out = releasable({
    mounted: [0, 1, 2, 3, 4, 50, 95, 100, 150, 199],
    range,
    m,
    view,
    far: 4800,
    now: 10000,
    lastSeen: (i) => lastSeen.get(i) ?? 0,
    idleMs: 5000,
    keep: (i) => i === 4,
  });
  // 3 は最近見た、4 は残す印、95・100 は範囲の中、150 は far（見えている所から 4800px）の中
  assert.deepEqual(out, [0, 1, 2, 50, 199]);
});

test("acceptRowSize: 描くのを省いている間・0 × 0・0.5px 未満の差は捨て、描かれたあとの値は受ける", () => {
  assert.equal(acceptRowSize({ skipped: true, prev: undefined, next: { width: 700, height: 120 } }), false);
  assert.equal(acceptRowSize({ skipped: false, prev: undefined, next: { width: 0, height: 0 } }), false);
  assert.equal(acceptRowSize({ skipped: false, prev: 100, next: { width: 700, height: 100.3 } }), false);
  assert.equal(acceptRowSize({ skipped: false, prev: 100, next: { width: 700, height: 180 } }), true);
  assert.equal(acceptRowSize({ skipped: false, prev: undefined, next: { width: 700, height: 64 } }), true);
});

test("keepRange: 選択の端の一方が流れの中なら端とその間の行を残し、両端とも外なら残さない", () => {
  assert.deepEqual(keepRange(3, 7, 100), { start: 3, end: 8 });
  assert.deepEqual(keepRange(7, 3, 100), { start: 3, end: 8 });
  // 片方が流れの後ろ（チャット欄など）
  assert.deepEqual(keepRange(90, 100, 100), { start: 90, end: 100 });
  // 片方が流れの前
  assert.deepEqual(keepRange(-1, 5, 100), { start: 0, end: 6 });
  // ⌘A（文書全体）・外から外へ
  assert.equal(keepRange(-1, 100, 100), null);
  assert.equal(keepRange(-1, -1, 100), null);
});
