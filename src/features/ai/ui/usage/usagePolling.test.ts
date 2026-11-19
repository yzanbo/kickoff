import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { startUsagePolling } from "./usagePolling";

test("使用状況は 1 分ごとに更新し、表示を終えたら更新を止める", () => {
  vi.useFakeTimers();
  let count = 0;
  const stop = startUsagePolling(() => count++);
  vi.advanceTimersByTime(59_999);
  assert.equal(count, 0);
  vi.advanceTimersByTime(1);
  assert.equal(count, 1);
  vi.advanceTimersByTime(60_000);
  assert.equal(count, 2);
  stop();
  vi.advanceTimersByTime(120_000);
  assert.equal(count, 2);
});
