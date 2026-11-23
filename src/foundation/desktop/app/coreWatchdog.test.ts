// コアの応答の見張り: 決めた長さ答えなければ onSilent、答えたら onResponded。コアがない回は見ない
import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { createWatchdog } from "./coreWatchdog";

test("createWatchdog: 答えない間が limitMs を超えたら onSilent、答えたら onResponded（reset で数え直す）", async () => {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  let answer = true;
  let present = true;
  const seen: string[] = [];
  const dog = createWatchdog({
    ping: () => (present ? (answer ? Promise.resolve() : new Promise(() => {})) : null),
    everyMs: 100,
    limitMs: 250,
    onResponded: () => seen.push("responded"),
    onSilent: (ms) => seen.push(`silent ${ms}`),
  });
  dog.start();
  await vi.advanceTimersByTimeAsync(100);
  assert.deepEqual(seen, ["responded"]);
  answer = false;
  seen.length = 0;
  await vi.advanceTimersByTimeAsync(300);
  assert.deepEqual(seen, ["silent 300"]);
  // コアがない回は ping も比べもしない
  present = false;
  seen.length = 0;
  await vi.advanceTimersByTimeAsync(300);
  assert.deepEqual(seen, []);
  // 数え直したら、また limitMs まで待つ
  present = true;
  dog.reset();
  await vi.advanceTimersByTimeAsync(200);
  assert.deepEqual(seen, []);
  dog.stop();
  assert.equal(vi.getTimerCount(), 0);
});
