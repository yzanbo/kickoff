import assert from "node:assert/strict";
import { test } from "vitest";
import { settle } from "@shared/testing/async";
import { createFakeScheduler } from "@shared/testing/fakeScheduler";
import { createPrefetchQueue, PREFETCH_QUEUE, PREFETCH_RETRY_MS } from "./prefetch";

function setup() {
  let busy = false;
  const clock = createFakeScheduler();
  const started: number[] = [];
  const finish: (() => void)[] = [];
  const queue = createPrefetchQueue({
    prefetch: (id) => {
      started.push(id);
      return new Promise<void>((resolve) => finish.push(resolve));
    },
    busy: () => busy,
    idle: clock.idle,
    timer: clock.timer,
  });
  return { queue, started, finish, clock, setBusy: (b: boolean) => (busy = b) };
}

test("手すきのときに 1 件ずつ、読み終えてから次を読む", async () => {
  const s = setup();
  s.queue.request([1, 2]);
  assert.deepEqual(s.started, []);
  s.clock.runIdle();
  assert.deepEqual(s.started, [1]);
  // 読んでいる間は次を予約しない
  s.clock.runIdle();
  assert.deepEqual(s.started, [1]);
  s.finish.shift()!();
  await settle();
  s.clock.runIdle();
  assert.deepEqual(s.started, [1, 2]);
});

test("新しい頼みを先に回し、待つのは上限まで（重なりは 1 つ）", () => {
  const s = setup();
  s.queue.request([1, 2, 3]);
  s.queue.request([9, 2]);
  assert.deepEqual(s.queue.pending(), [9, 2, 1, 3]);
  s.queue.request([10, 11, 12]);
  assert.equal(s.queue.pending().length, PREFETCH_QUEUE);
  assert.deepEqual(s.queue.pending(), [10, 11, 12, 9, 2]);
});

test("見ているチャットの読み込み中は待ち、終わってから読む", () => {
  const s = setup();
  s.setBusy(true);
  s.queue.request([5]);
  s.clock.runIdle();
  assert.deepEqual(s.started, []);
  assert.equal(s.clock.pending.timers, 1);
  s.setBusy(false);
  // 確かめ直すのは PREFETCH_RETRY_MS のあと
  s.clock.advance(PREFETCH_RETRY_MS - 1);
  assert.equal(s.clock.pending.idles, 0);
  s.clock.advance(1);
  s.clock.runIdle();
  assert.deepEqual(s.started, [5]);
});
