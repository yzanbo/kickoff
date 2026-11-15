import assert from "node:assert/strict";
import { test } from "vitest";
import { createAutoFetcher } from "./gitAutoFetch";

/** 外から終わらせられる約束（フェッチの途中を作る） */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

test("前の自動のフェッチから間がなければ飛ばし、経てば取ってくる", async () => {
  let clock = 0;
  const fetcher = createAutoFetcher({ minInterval: 60_000, now: () => clock });
  let calls = 0;
  const run = async () => void calls++;
  assert.equal(await fetcher.fetch("p", run), true);
  clock = 59_999;
  assert.equal(await fetcher.fetch("p", run), false);
  // リポジトリが違えば別に数える
  assert.equal(await fetcher.fetch("q", run), true);
  clock = 60_000;
  assert.equal(await fetcher.fetch("p", run), true);
  assert.equal(calls, 3);
});

test("失敗しても投げず、次の間隔までは取り直さない", async () => {
  let clock = 0;
  const fetcher = createAutoFetcher({ minInterval: 1000, now: () => clock });
  assert.equal(
    await fetcher.fetch("p", () => Promise.reject(new Error("offline"))),
    true,
  );
  clock = 500;
  assert.equal(await fetcher.fetch("p", async () => undefined), false);
});

test("自動のフェッチの途中に重ねて頼んでも 1 回だけ", async () => {
  let clock = 0;
  const fetcher = createAutoFetcher({ minInterval: 0, now: () => clock });
  const gate = deferred();
  const first = fetcher.fetch("p", () => gate.promise);
  clock = 10;
  assert.equal(await fetcher.fetch("p", async () => undefined), false);
  gate.resolve();
  assert.equal(await first, true);
});

test("押した操作は、自動のフェッチが終わるのを待ってから始める", async () => {
  const fetcher = createAutoFetcher({ minInterval: 0 });
  const order: string[] = [];
  const gate = deferred();
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
  const gate = deferred();
  const op = fetcher.operate("p", () => gate.promise.then(() => Promise.reject(new Error("rejected"))));
  assert.equal(await fetcher.fetch("p", async () => undefined), false);
  gate.resolve();
  await assert.rejects(op, /rejected/);
  assert.equal(await fetcher.fetch("p", async () => undefined), true);
});
