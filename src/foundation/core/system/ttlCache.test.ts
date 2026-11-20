import assert from "node:assert/strict";
import { test } from "vitest";
import { ttlCache } from "./ttlCache";

test("ttlCache: 覚えた値は期限まで返し、過ぎたら返さない。キーごとに別", () => {
  // 時計を差し替える（本当の時計で待つと、負荷が高いときに期限の前後がずれる）
  let clock = 1_000;
  const cache = ttlCache<string, number>(30, { now: () => clock });
  assert.equal(cache.get("a"), undefined);
  cache.set("a", 1);
  cache.set("b", 2);
  clock += 29;
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), 2);
  clock += 1;
  assert.equal(cache.get("a"), undefined);
  cache.set("a", 3);
  assert.equal(cache.get("a"), 3);
});

test("ttlCache の getOrLoad: 同じキーの同時の頼みは 1 回にまとめ、期限まで覚える。失敗は覚えない。invalidate は途中の分も捨てる", async () => {
  let clock = 0;
  const cache = ttlCache<string, number>({ ms: 1000, clock: { now: () => clock } });
  let loads = 0;
  const load = async () => ++loads;
  assert.deepEqual(await Promise.all([cache.getOrLoad("a", load), cache.getOrLoad("a", load)]), [1, 1]);
  clock += 999;
  assert.equal(await cache.getOrLoad("a", load), 1);
  clock += 1;
  assert.equal(await cache.getOrLoad("a", load), 2);
  await assert.rejects(cache.getOrLoad("b", async () => Promise.reject(new Error("x"))), /x/);
  assert.equal(await cache.getOrLoad("b", load), 3);
  // 取りに行っている途中で捨てたら、その結果は覚えずに取り直す
  let release: (v: number) => void = () => {};
  const slow = cache.getOrLoad("c", () => new Promise<number>((r) => (release = r)));
  cache.invalidate("c");
  release(100);
  assert.equal(await slow, 100);
  assert.equal(await cache.getOrLoad("c", load), 4);
});

test("ttlCache の max: 超えたら古い順に捨てる（覚え直したものは新しい扱い）", () => {
  const cache = ttlCache<string, number>({ ms: 1000, max: 2, clock: { now: () => 0 } });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 3);
  cache.set("c", 4);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 3);
  assert.equal(cache.get("c"), 4);
});
