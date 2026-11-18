import assert from "node:assert/strict";
import { test } from "vitest";
import { deferred } from "@shared/testing/async";
import { createFakeScheduler } from "@shared/testing/fakeScheduler";
import { createAutoFetcher } from "./gitAutoFetch";

test("前の自動のフェッチから間がなければ飛ばし、経てば取ってくる", async () => {
  const clock = createFakeScheduler();
  const fetcher = createAutoFetcher({ minInterval: 60_000, now: clock.now });
  let calls = 0;
  const run = async () => void calls++;
  assert.equal(await fetcher.fetch("p", run), true);
  clock.advance(59_999);
  assert.equal(await fetcher.fetch("p", run), false);
  // リポジトリが違えば別に数える
  assert.equal(await fetcher.fetch("q", run), true);
  clock.advance(1);
  assert.equal(await fetcher.fetch("p", run), true);
  assert.equal(calls, 3);
});

test("失敗しても投げず、次の間隔までは取り直さない", async () => {
  const clock = createFakeScheduler();
  const fetcher = createAutoFetcher({ minInterval: 1000, now: clock.now });
  assert.equal(
    await fetcher.fetch("p", () => Promise.reject(new Error("offline"))),
    true,
  );
  clock.advance(500);
  assert.equal(await fetcher.fetch("p", async () => undefined), false);
});

test("自動のフェッチの途中に重ねて頼んでも 1 回だけ", async () => {
  const clock = createFakeScheduler();
  const fetcher = createAutoFetcher({ minInterval: 0, now: clock.now });
  const gate = deferred<void>();
  const first = fetcher.fetch("p", () => gate.promise);
  clock.advance(10);
  assert.equal(await fetcher.fetch("p", async () => undefined), false);
  gate.resolve();
  assert.equal(await first, true);
});

test("押した操作は、自動のフェッチが終わるのを待ってから始める", async () => {
  const fetcher = createAutoFetcher({ minInterval: 0 });
  const order: string[] = [];
  const gate = deferred<void>();
  const auto = fetcher.fetch("p", async () => {
    await gate.promise;
    order.push("fetch");
  });
  const op = fetcher.operate("p", async () => {
    order.push("pull");
    return 1;
  });
  await Promise.resolve();
  assert.deepEqual(order, []);
  gate.resolve();
  assert.equal(await op, 1);
  await auto;
  assert.deepEqual(order, ["fetch", "pull"]);
});

test("押した操作の実行中は自動のフェッチを飛ばし、終われば（失敗でも）また取ってくる", async () => {
  const fetcher = createAutoFetcher({ minInterval: 0 });
  const gate = deferred<void>();
  const op = fetcher.operate("p", () => gate.promise.then(() => Promise.reject(new Error("rejected"))));
  assert.equal(await fetcher.fetch("p", async () => undefined), false);
  gate.resolve();
  await assert.rejects(op, /rejected/);
  assert.equal(await fetcher.fetch("p", async () => undefined), true);
});
