import assert from "node:assert/strict";
import { test } from "node:test";
import { ttlCache } from "./ttlCache.js";

test("ttlCache: 覚えた値は期限まで返し、過ぎたら返さない。キーごとに別", async () => {
  const cache = ttlCache<string, number>(30);
  assert.equal(cache.get("a"), undefined);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), 2);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(cache.get("a"), undefined);
  cache.set("a", 3);
  assert.equal(cache.get("a"), 3);
});
