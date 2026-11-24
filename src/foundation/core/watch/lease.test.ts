import assert from "node:assert/strict";
import { test } from "vitest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { createLease } from "./lease";

test("Lease: 最初の借り手で onFirst、期限が切れて 0 になったら onEmpty で止める（触れば延びる）", async () => {
  const clock = manualClock();
  const calls: string[] = [];
  const lease = createLease<number>({ ttlMs: 1000, sweepMs: 250, clock, onFirst: () => calls.push("first"), onEmpty: () => calls.push("empty") });
  lease.touch(1);
  lease.touch(2);
  assert.deepEqual(calls, ["first"]);
  assert.deepEqual([...lease.active], [1, 2]);
  await clock.advance(750);
  lease.touch(2);
  await clock.advance(250);
  assert.deepEqual([...lease.active], [2]);
  await clock.advance(750);
  assert.deepEqual([...lease.active], []);
  assert.deepEqual(calls, ["first", "empty"]);
  assert.equal(clock.pending, 0);
});

test("Lease: release で 0 になったらすぐ onEmpty。また借りれば onFirst", () => {
  const clock = manualClock();
  const calls: string[] = [];
  const lease = createLease<string>({ ttlMs: 1000, sweepMs: 250, clock, onFirst: () => calls.push("first"), onEmpty: () => calls.push("empty") });
  lease.touch("a");
  lease.release("b");
  lease.release("a");
  lease.release("a");
  lease.touch("a");
  assert.deepEqual(calls, ["first", "empty", "first"]);
});
