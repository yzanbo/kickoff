import assert from "node:assert/strict";
import { test } from "vitest";
import { createLruMap } from "./lruMap";

test("createLruMap: 上限を超えたら、いちばん長く使っていないものから捨てる", () => {
  const lru = createLruMap<string, number>(2);
  lru.set("a", 1);
  lru.set("b", 2);
  lru.set("c", 3);
  assert.equal(lru.size, 2);
  assert.equal(lru.peek("a"), undefined);
  assert.equal(lru.peek("b"), 2);
  assert.equal(lru.peek("c"), 3);
});

test("createLruMap: get で読んだものは新しい側へ動き、peek では動かない", () => {
  const lru = createLruMap<string, number>(2);
  lru.set("a", 1);
  lru.set("b", 2);
  assert.equal(lru.get("a"), 1);
  lru.set("c", 3);
  // a を読んだので、捨てられるのは b
  assert.equal(lru.peek("a"), 1);
  assert.equal(lru.peek("b"), undefined);

  assert.equal(lru.peek("a"), 1);
  lru.set("d", 4);
  // peek では動かないので、捨てられるのは a
  assert.equal(lru.peek("a"), undefined);
  assert.equal(lru.peek("c"), 3);
});

test("createLruMap: 同じキーを入れ直すと新しい側へ動き、数は増えない。delete で消える", () => {
  const lru = createLruMap<string, number>(2);
  lru.set("a", 1);
  lru.set("b", 2);
  lru.set("a", 10);
  assert.equal(lru.size, 2);
  lru.set("c", 3);
  assert.equal(lru.peek("a"), 10);
  assert.equal(lru.peek("b"), undefined);
  assert.equal(lru.delete("a"), true);
  assert.equal(lru.delete("a"), false);
  assert.equal(lru.get("a"), undefined);
  assert.equal(lru.size, 1);
});

test("createLruMap: 値が undefined でも覚えにあるものとして順を動かす", () => {
  const lru = createLruMap<string, number | undefined>(2);
  lru.set("a", undefined);
  lru.set("b", 2);
  lru.get("a");
  lru.set("c", 3);
  assert.equal(lru.peek("b"), undefined);
  assert.equal(lru.size, 2);
});
