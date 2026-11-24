import assert from "node:assert/strict";
import { test } from "vitest";
import { deferred } from "@shared/foundation/testing/async";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { createRepoLock } from "./repoLock";

/** 自動のフェッチ（飛ばすかを確かめてから動かす。ルートと同じ形）。飛ばしたら false */
async function autoFetch(lock: ReturnType<typeof createRepoLock>, key: string, job: () => Promise<unknown>): Promise<boolean> {
  if (!lock.shouldAutoFetch(key)) return false;
  await lock.run(key, "fetch", job).catch(() => undefined);
  return true;
}

test("前の自動のフェッチから 60 秒経っていなければ飛ばし、経てば取ってくる（リポジトリごとに数える）", async () => {
  const clock = manualClock();
  const lock = createRepoLock(clock, { autoFetchMinMs: 60_000 });
  let calls = 0;
  const job = async () => void calls++;
  assert.equal(await autoFetch(lock, "p", job), true);
  await clock.advance(59_999);
  assert.equal(await autoFetch(lock, "p", job), false);
  assert.equal(await autoFetch(lock, "q", job), true);
  await clock.advance(1);
  assert.equal(await autoFetch(lock, "p", job), true);
  assert.equal(calls, 3);
});

test("失敗しても次の間隔までは取り直さない", async () => {
  const clock = manualClock();
  const lock = createRepoLock(clock, { autoFetchMinMs: 1000 });
  assert.equal(await autoFetch(lock, "p", () => Promise.reject(new Error("offline"))), true);
  await clock.advance(500);
  assert.equal(lock.shouldAutoFetch("p"), false);
});

test("自動のフェッチの途中に重ねて頼んでも 1 回だけ", async () => {
  const lock = createRepoLock(manualClock(), { autoFetchMinMs: 0 });
  const gate = deferred<void>();
  const first = autoFetch(lock, "p", () => gate.promise);
  assert.equal(lock.shouldAutoFetch("p"), false);
  gate.resolve();
  assert.equal(await first, true);
  assert.equal(lock.shouldAutoFetch("p"), true);
});

test("利用者の操作は自動のフェッチが終わるのを待ってから始め、実行中は自動のフェッチを飛ばす（失敗で終わっても戻る）", async () => {
  const lock = createRepoLock(manualClock(), { autoFetchMinMs: 0 });
  const order: string[] = [];
  const gate = deferred<void>();
  const auto = autoFetch(lock, "p", async () => {
    await gate.promise;
    order.push("fetch");
  });
  const opGate = deferred<void>();
  const op = lock.run("p", "user", async () => {
    order.push("pull");
    await opGate.promise;
    throw new Error("rejected");
  });
  await Promise.resolve();
  assert.deepEqual(order, []);
  gate.resolve();
  await auto;
  await Promise.resolve();
  assert.deepEqual(order, ["fetch", "pull"]);
  assert.equal(lock.shouldAutoFetch("p"), false);
  opGate.resolve();
  await assert.rejects(op, /rejected/);
  assert.equal(lock.shouldAutoFetch("p"), true);
});
