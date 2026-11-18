import { test } from "vitest";
import assert from "node:assert/strict";
import { createFakeScheduler } from "@shared/testing/fakeScheduler";
import { allocateColumns, allocateRows, columnsInView, COLUMN_MIN_PX, createProgressive, firstRowLimit, progressiveSlice } from "./progressive";

/** 手で進める frame と、呼ばれた transition・flushSync の記録 */
function harness() {
  const clock = createFakeScheduler();
  const log: string[] = [];
  const progressive = createProgressive({
    frame: clock.frame,
    transition: (update) => {
      log.push("transition");
      update();
    },
    flushSync: (update) => {
      log.push("flushSync");
      update();
    },
  });
  return { progressive, log, tick: clock.runFrames, frames: () => clock.pending.frames };
}

test("最初に描く行の数は、窓の高さを 24px で割った数に 8 を足したもの", () => {
  assert.equal(firstRowLimit(880), 45);
  assert.equal(firstRowLimit(0), 8);
});

test("縦に並ぶまとまりには上から順に配り、少ないまとまりの余りは次へ回し、合計は上限を超えない", () => {
  assert.deepEqual(allocateRows([10, 50, 30], 45), [10, 35, 0]);
  assert.deepEqual(allocateRows([0, 3, 100], 45), [0, 3, 42]);
  assert.deepEqual(allocateRows([5, 5], 45), [5, 5]);
  assert.deepEqual(allocateRows([5, 5], 0), [0, 0]);
  // 最初の描画のあとは、まとまりの行の数で切らない（同じ上限を読む、数に入れていない一覧も残りまで描く）
  assert.deepEqual(allocateRows([7, 900, 0], Infinity), [Infinity, Infinity, Infinity]);
});

test("上限に収まる一覧は同じ配列のまま、超えれば頭から上限の数と省いた数", () => {
  const rows = [1, 2, 3, 4, 5];
  const all = progressiveSlice(rows, Infinity);
  assert.equal(all.shown, rows);
  assert.equal(all.omitted, 0);
  assert.equal(progressiveSlice(rows, 5).shown, rows);
  assert.deepEqual(progressiveSlice(rows, 2), { shown: [1, 2], omitted: 3 });
  assert.deepEqual(progressiveSlice(rows, 0), { shown: [], omitted: 5 });
});

test("開いたページは 2 回の frame のあと、transition の中で残りを描く。描き終えて外すまでは予約に残す", () => {
  const { progressive, log, tick } = harness();
  let revealed = 0;
  const done = progressive.open(() => (revealed += 1));
  assert.equal(progressive.pending(), 1);
  tick();
  assert.equal(revealed, 0);
  tick();
  assert.equal(revealed, 1);
  assert.deepEqual(log, ["transition"]);
  // transition の描き直しが終わる前（外す前）の ensureAll は、もう一度すぐに描く
  assert.equal(progressive.pending(), 1);
  progressive.ensureAll();
  assert.equal(revealed, 2);
  assert.deepEqual(log, ["transition", "flushSync"]);
  done();
  assert.equal(progressive.pending(), 0);
});

test("描き終えて外した予約は ensureAll の対象にならない", () => {
  const { progressive, log, tick } = harness();
  let revealed = 0;
  const done = progressive.open(() => (revealed += 1));
  tick();
  tick();
  done();
  progressive.ensureAll();
  assert.equal(revealed, 1);
  assert.deepEqual(log, ["transition"]);
});

test("ensureAll は予約中のページを flushSync の中ですぐにすべて描き、あとから frame が来ても描き直さない", () => {
  const { progressive, log, tick, frames } = harness();
  const revealed: string[] = [];
  progressive.open(() => revealed.push("a"));
  progressive.open(() => revealed.push("b"));
  tick();
  progressive.ensureAll();
  assert.deepEqual(revealed, ["a", "b"]);
  assert.deepEqual(log, ["flushSync"]);
  assert.equal(frames(), 0);
  tick();
  assert.deepEqual(revealed, ["a", "b"]);
  // 予約がなければ何もしない
  progressive.ensureAll();
  assert.deepEqual(log, ["flushSync"]);
});

test("取り消した予約（開き直した古いもの）は、あとから残りを描かない", () => {
  const { progressive, tick } = harness();
  const revealed: string[] = [];
  const cancelOld = progressive.open(() => revealed.push("old"));
  tick();
  cancelOld();
  const doneNew = progressive.open(() => revealed.push("new"));
  tick();
  tick();
  assert.deepEqual(revealed, ["new"]);
  doneNew();
  // 済んだあとに取り消しても何も起きない
  cancelOld();
  progressive.ensureAll();
  assert.deepEqual(revealed, ["new"]);
});

test("横に並ぶ列は、窓の幅に入りうる左の列にだけ同じ上限を配り、見えない列は 0（上限なしならすべて）", () => {
  assert.equal(columnsInView(1440), Math.ceil(1440 / COLUMN_MIN_PX));
  assert.equal(columnsInView(0), 1);
  assert.deepEqual(allocateColumns(5, 45, 3), [45, 45, 45, 0, 0]);
  assert.deepEqual(allocateColumns(2, 45, 3), [45, 45]);
  assert.deepEqual(allocateColumns(3, Number.POSITIVE_INFINITY, 1), [Infinity, Infinity, Infinity]);
});
