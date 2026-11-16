import assert from "node:assert/strict";
import { test } from "vitest";
import { createPrefetchQueue, PREFETCH_QUEUE, PREFETCH_RETRY_MS } from "./prefetch";

function setup() {
  let busy = false;
  const idles: (() => void)[] = [];
  const timers: { ms: number; fn: () => void }[] = [];
  const started: number[] = [];
  const finish: (() => void)[] = [];
  const queue = createPrefetchQueue({
    prefetch: (id) => {
      started.push(id);
      return new Promise<void>((resolve) => finish.push(resolve));
    },
    busy: () => busy,
    idle: (fn) => {
      idles.push(fn);
      return () => idles.splice(idles.indexOf(fn), 1);
    },
    timer: (fn, ms) => {
      const t = { ms, fn };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
  });
  const runIdle = () => idles.shift()?.();
  return { queue, started, finish, runIdle, timers, setBusy: (b: boolean) => (busy = b) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("手すきのときに 1 件ずつ、読み終えてから次を読む", async () => {
  const s = setup();
  s.queue.request([1, 2]);
  assert.deepEqual(s.started, []);
  s.runIdle();
  assert.deepEqual(s.started, [1]);
  // 読んでいる間は次を予約しない
  s.runIdle();
  assert.deepEqual(s.started, [1]);
  s.finish.shift()!();
  await settle();
  s.runIdle();
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
  s.runIdle();
  assert.deepEqual(s.started, []);
  assert.equal(s.timers.length, 1);
  assert.equal(s.timers[0].ms, PREFETCH_RETRY_MS);
  s.setBusy(false);
  s.timers.shift()!.fn();
  s.runIdle();
  assert.deepEqual(s.started, [5]);
});
