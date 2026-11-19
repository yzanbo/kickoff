import assert from "node:assert/strict";
import { test } from "vitest";
import { manualClock } from "./manualClock";

test("manualClock: 時刻を進めると、来たタイマーを時刻の順に、時計をその時刻にしてから呼ぶ", async () => {
  const clock = manualClock(1_000);
  const calls: string[] = [];
  clock.setTimeout(() => calls.push(`b@${clock.now()}`), 20);
  clock.setTimeout(() => calls.push(`a@${clock.now()}`), 10);
  clock.setTimeout(() => calls.push(`c@${clock.now()}`), 30);
  assert.equal(clock.pending, 3);
  await clock.advance(25);
  assert.deepEqual(calls, ["a@1010", "b@1020"]);
  assert.equal(clock.now(), 1_025);
  assert.equal(clock.iso(), new Date(1_025).toISOString());
  assert.equal(clock.pending, 1);
});

test("manualClock: clearTimeout したタイマーは呼ばない（null・外したあとも受ける）", async () => {
  const clock = manualClock();
  let called = 0;
  const handle = clock.setTimeout(() => called++, 10);
  clock.clearTimeout(handle);
  clock.clearTimeout(handle);
  clock.clearTimeout(null);
  await clock.advance(100);
  assert.equal(called, 0);
  assert.equal(clock.pending, 0);
});

test("manualClock: setInterval は間隔ごとに繰り返し、clearInterval で止まる", async () => {
  const clock = manualClock(0);
  const at: number[] = [];
  const handle = clock.setInterval(() => at.push(clock.now()), 10);
  await clock.advance(35);
  assert.deepEqual(at, [10, 20, 30]);
  clock.clearInterval(handle);
  await clock.advance(100);
  assert.deepEqual(at, [10, 20, 30]);
  assert.equal(clock.pending, 0);
});

test("manualClock: sleep は時刻が来たら解け、signal で止めたら AbortError でタイマーも外す", async () => {
  const clock = manualClock(0);
  let woke = false;
  const sleeping = clock.sleep(50).then(() => (woke = true));
  await clock.advance(49);
  assert.equal(woke, false);
  await clock.advance(1);
  await sleeping;
  assert.equal(woke, true);

  const controller = new AbortController();
  const stopped = clock.sleep(50, controller.signal);
  controller.abort();
  await assert.rejects(stopped, { name: "AbortError" });
  assert.equal(clock.pending, 0);
  await assert.rejects(clock.sleep(10, controller.signal), { name: "AbortError" });
});

test("manualClock: fireAll は時刻に関係なく待っているものを全部呼び、呼んでいる間に予約したものは呼ばない", () => {
  const clock = manualClock(0);
  const calls: string[] = [];
  clock.setTimeout(() => {
    calls.push("long");
    clock.setTimeout(() => calls.push("later"), 1);
  }, 60_000);
  clock.setTimeout(() => calls.push("short"), 5);
  clock.fireAll();
  assert.deepEqual(calls, ["long", "short"]);
  assert.equal(clock.now(), 0);
  assert.equal(clock.pending, 1);
});
