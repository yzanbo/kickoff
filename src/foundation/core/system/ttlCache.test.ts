import assert from "node:assert/strict";
import { test } from "vitest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { ttlCache } from "./ttlCache";

test("ttlCache: 覚えた値は期限まで返し、過ぎたら返さない。キーごとに別", () => {
  // 時計を差し替える（本当の時計で待つと、負荷が高いときに期限の前後がずれる）
  let clock = 1_000;
  const cache = ttlCache<string, number>({ ms: 30, clock: { now: () => clock } });
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

test("ttlCache の take・delete・clear: 取ったら消す（期限が切れていれば undefined）", async () => {
  const clock = manualClock();
  const cache = ttlCache<string, true>({ ms: 5 * 60_000, clock });
  cache.set("a", true);
  cache.set("b", true);
  cache.set("c", true);
  assert.equal(cache.take("a"), true);
  assert.equal(cache.take("a"), undefined);
  cache.delete("b");
  assert.equal(cache.get("b"), undefined);
  await clock.advance(5 * 60_000);
  assert.equal(cache.take("c"), undefined);
  cache.set("d", true);
  cache.clear();
  assert.equal(cache.get("d"), undefined);
});

test("ttlCache の deleteWhere: 当てはまるキーだけ捨てる", () => {
  const cache = ttlCache<string, number>({ ms: 1000 });
  cache.set("1:a", 1);
  cache.set("1:b", 2);
  cache.set("2:a", 3);
  cache.deleteWhere((key) => key.startsWith("1:"));
  assert.deepEqual(["1:a", "1:b", "2:a"].map((k) => cache.get(k)), [undefined, undefined, 3]);
});
