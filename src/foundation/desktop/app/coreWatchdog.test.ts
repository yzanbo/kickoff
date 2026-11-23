// コアの応答の見張り: 決めた長さ答えなければ onSilent、答えたら onResponded。コアがない回は見ない
import assert from "node:assert/strict";
import { test } from "vitest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { createWatchdog } from "./coreWatchdog";

test("createWatchdog: 答えない間が limitMs を超えたら onSilent、答えたら onResponded（reset で数え直す）", async () => {
  const clock = manualClock();
  let answer = true;
  let present = true;
  const seen: string[] = [];
  const dog = createWatchdog({
    ping: () => (present ? (answer ? Promise.resolve() : new Promise(() => {})) : null),
    everyMs: 100,
    limitMs: 250,
    onResponded: () => seen.push("responded"),
    onSilent: (ms) => seen.push(`silent ${ms}`),
    clock,
  });
  dog.start();
  await clock.advance(100);
  assert.deepEqual(seen, ["responded"]);
  answer = false;
  seen.length = 0;
  await clock.advance(300);
  assert.deepEqual(seen, ["silent 300"]);
  // コアがない回は ping も比べもしない
  present = false;
  seen.length = 0;
  await clock.advance(300);
  assert.deepEqual(seen, []);
  // 数え直したら、また limitMs まで待つ
  present = true;
  dog.reset();
  await clock.advance(200);
  assert.deepEqual(seen, []);
  dog.stop();
  assert.equal(clock.pending, 0);
});
