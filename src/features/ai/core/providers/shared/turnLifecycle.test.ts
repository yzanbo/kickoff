import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { createStopper, STOP_GRACE_MS } from "./turnLifecycle";

function recorder() {
  const calls: string[] = [];
  return { calls, opts: { interrupt: () => calls.push("interrupt"), onForced: () => calls.push("forced") } };
}

test("止める合図で interrupt を呼び、5 秒待って onForced を呼ぶ", () => {
  vi.useFakeTimers();
  const ac = new AbortController();
  const rec = recorder();
  createStopper(ac.signal, rec.opts);
  assert.deepEqual(rec.calls, []);
  ac.abort();
  assert.deepEqual(rec.calls, ["interrupt"]);
  vi.advanceTimersByTime(STOP_GRACE_MS - 1);
  assert.deepEqual(rec.calls, ["interrupt"]);
  vi.advanceTimersByTime(1);
  assert.deepEqual(rec.calls, ["interrupt", "forced"]);
});

test("足したときにもう止められていれば、すぐ interrupt を呼ぶ（待つ長さは graceMs で変えられる）", () => {
  vi.useFakeTimers();
  const ac = new AbortController();
  ac.abort();
  const rec = recorder();
  createStopper(ac.signal, { ...rec.opts, graceMs: 100 });
  assert.deepEqual(rec.calls, ["interrupt"]);
  vi.advanceTimersByTime(100);
  assert.deepEqual(rec.calls, ["interrupt", "forced"]);
});

test("dispose のあとは、合図が来ても待っていても呼ばない", () => {
  vi.useFakeTimers();
  const before = new AbortController();
  const idle = recorder();
  createStopper(before.signal, idle.opts).dispose();
  before.abort();
  assert.deepEqual(idle.calls, []);

  const during = new AbortController();
  const waiting = recorder();
  const stopper = createStopper(during.signal, waiting.opts);
  during.abort();
  stopper.dispose();
  vi.advanceTimersByTime(STOP_GRACE_MS);
  assert.deepEqual(waiting.calls, ["interrupt"]);
});
