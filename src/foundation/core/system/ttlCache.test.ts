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
