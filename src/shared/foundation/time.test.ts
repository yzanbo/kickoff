import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { withTimeout } from "./time";

test("withTimeout: 間に合えば値を返し、間に合わなければ決めた文のエラーにする", async () => {
  const clock = createFakeScheduler();
  assert.equal(await withTimeout(Promise.resolve(1), 100, "遅い", clock), 1);
  const late = withTimeout(new Promise<number>(() => {}), 100, "遅い", clock);
  clock.advance(100);
  await assert.rejects(late, /遅い/);
  assert.equal(clock.pending.timers, 0);
});
