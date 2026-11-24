import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeScheduler } from "./fakeScheduler";

test("フレームは予約した順に 1 回だけ描き、描いている間に予約したものは次のフレーム", () => {
  const clock = createFakeScheduler();
  const log: string[] = [];
  clock.frame(() => log.push("a"));
  clock.frame(() => {
    log.push("b");
    clock.frame(() => log.push("c"));
  });
  assert.deepEqual(clock.pending, { frames: 2, idles: 0, timers: 0 });
  clock.runFrames();
  assert.deepEqual(log, ["a", "b"]);
  assert.equal(clock.pending.frames, 1);
  clock.runFrames();
  clock.runFrames();
  assert.deepEqual(log, ["a", "b", "c"]);
});

test("手すきの予約は runIdle で全部呼ぶ。同じ関数を 2 回予約すれば 2 回呼ぶ", () => {
  const clock = createFakeScheduler();
  let calls = 0;
  const fn = () => calls++;
  clock.idle(fn);
  clock.idle(fn);
  assert.equal(clock.pending.idles, 2);
  clock.runIdle();
  assert.equal(calls, 2);
  assert.equal(clock.pending.idles, 0);
});

test("advance は時刻の来たタイマーを時刻の順（同じ時刻なら予約の順）に、時計をその時刻にしてから呼ぶ", () => {
  const clock = createFakeScheduler(100);
  const log: string[] = [];
  clock.timer(() => log.push(`b@${clock.now()}`), 20);
  clock.timer(() => log.push(`a@${clock.now()}`), 10);
  clock.timer(() => log.push(`c@${clock.now()}`), 20);
  clock.timer(() => log.push("late"), 31);
  clock.advance(30);
  assert.deepEqual(log, ["a@110", "b@120", "c@120"]);
  assert.equal(clock.now(), 130);
  assert.equal(clock.pending.timers, 1);
  clock.advance(1);
  assert.deepEqual(log, ["a@110", "b@120", "c@120", "late"]);
});

test("タイマーの中で予約したタイマーも、進めた時刻までなら同じ advance で呼ぶ", () => {
  const clock = createFakeScheduler();
  const log: number[] = [];
  clock.timer(() => {
    log.push(clock.now());
    clock.timer(() => log.push(clock.now()), 5);
  }, 10);
  clock.advance(15);
  assert.deepEqual(log, [10, 15]);
});

test("取り消したものは呼ばない（同じフレームの先のものが取り消したものも）", () => {
  const clock = createFakeScheduler();
  const log: string[] = [];
  const cancelTimer = clock.timer(() => log.push("timer"), 10);
  const cancelIdle = clock.idle(() => log.push("idle"));
  let cancelSecond = () => {};
  clock.frame(() => {
    log.push("first");
    cancelSecond();
  });
  cancelSecond = clock.frame(() => log.push("second"));
  cancelTimer();
  cancelIdle();
  assert.deepEqual(clock.pending, { frames: 2, idles: 0, timers: 0 });
  clock.runFrames();
  clock.runIdle();
  clock.advance(10);
  assert.deepEqual(log, ["first"]);
  // 呼んだあとに取り消しても何も起きない
  cancelSecond();
  assert.deepEqual(clock.pending, { frames: 0, idles: 0, timers: 0 });
});
