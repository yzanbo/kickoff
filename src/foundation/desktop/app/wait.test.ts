import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { withTimeout } from "./wait";

test("withTimeout: 間に合えば値を返し、間に合わなければ決めた文のエラーにする", async () => {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  assert.equal(await withTimeout(Promise.resolve(1), 100, "遅い"), 1);
  const late = withTimeout(new Promise<number>(() => {}), 100, "遅い");
  vi.advanceTimersByTime(100);
  await assert.rejects(late, /遅い/);
  assert.equal(vi.getTimerCount(), 0);
});
