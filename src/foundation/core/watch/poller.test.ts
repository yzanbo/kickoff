import assert from "node:assert/strict";
import { test } from "vitest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { createPoller } from "./poller";

test("Poller: 間隔ごとに流し、止めたら流さない。runAtStart ならすぐ 1 回", async () => {
  const clock = manualClock();
  let runs = 0;
  const poller = createPoller({ intervalMs: 1000, runAtStart: true, clock, run: async () => void runs++ });
  assert.equal(poller.running, false);
  poller.start();
  poller.start();
  assert.equal(poller.running, true);
  await Promise.resolve();
  assert.equal(runs, 1);
  await clock.advance(1000);
  await clock.advance(1000);
  assert.equal(runs, 3);
  poller.stop();
  assert.equal(poller.running, false);
  await clock.advance(5000);
  assert.equal(runs, 3);
  assert.equal(clock.pending, 0);
});

test("Poller: 同時には 1 回だけ流し、minGapMs 以内の refresh はまとめる。失敗は onError に渡して次も流す", async () => {
  const clock = manualClock();
  const errors: unknown[] = [];
  let runs = 0;
  let release: () => void = () => {};
  const poller = createPoller({
    intervalMs: 60_000,
    minGapMs: 500,
    clock,
    onError: (e) => errors.push(e),
    run: () => {
      runs++;
      return new Promise<void>((resolve) => (release = resolve));
    },
  });
  const first = poller.refresh();
  const second = poller.refresh();
  assert.equal(first, second);
  assert.equal(runs, 1);
  release();
  await first;
  // 流し終えても minGapMs 以内ならまとめる
  await poller.refresh();
  assert.equal(runs, 1);
  await clock.advance(500);
  const third = poller.refresh();
  assert.equal(runs, 2);
  release();
  await third;
  const failing = createPoller({ intervalMs: 1000, clock, onError: (e) => errors.push(e), run: async () => Promise.reject(new Error("落ちた")) });
  await failing.refresh();
  await failing.refresh();
  assert.deepEqual(
    errors.map((e) => (e as Error).message),
    ["落ちた", "落ちた"],
  );
});

test("Poller: force の refresh は minGapMs 以内でも流し、そこからまとめる間を数え直す", async () => {
  const clock = manualClock();
  let runs = 0;
  const poller = createPoller({ intervalMs: 60_000, minGapMs: 500, clock, run: async () => void runs++ });
  await poller.refresh();
  await poller.refresh({ force: true });
  assert.equal(runs, 2);
  await clock.advance(400);
  await poller.refresh();
  assert.equal(runs, 2);
});
