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

test("createLruMap: 重さを渡すと、合計が上限を超えないよう古いものから捨て、1 つで上限を超えるものは入れない", () => {
  const lru = createLruMap<string, string>(10, { maxWeight: 6, weigh: (v) => v.length });
  lru.set("a", "aa");
  lru.set("b", "bbb");
  lru.set("c", "cc");
  // 2 + 3 + 2 = 7 > 6 なので、いちばん古い a を捨てる
  assert.equal(lru.peek("a"), undefined);
  assert.equal(lru.size, 2);
  // 入れ直すと前の重さは数えない
  lru.set("b", "b");
  lru.set("d", "ddd");
  assert.deepEqual([lru.peek("b"), lru.peek("c"), lru.peek("d")], ["b", "cc", "ddd"]);
  // 上限より重いものは入れない（ほかも捨てない）
  lru.set("e", "eeeeeee");
  assert.equal(lru.peek("e"), undefined);
  assert.equal(lru.size, 3);
  lru.delete("d");
  lru.set("f", "ffff");
  assert.deepEqual([lru.peek("b"), lru.peek("c"), lru.peek("f")], ["b", undefined, "ffff"]);
});

test("createLruMap の onEvict: 上限・重さで捨てた・同じキーで入れ直した・重すぎて入れなかった値に呼ぶ。delete では呼ばない", () => {
  const evicted: string[] = [];
  const lru = createLruMap<string, string>(2, { maxWeight: 5, weigh: (v) => v.length }, { onEvict: (v, k) => evicted.push(`${k}=${v}`) });
  lru.set("a", "1");
  lru.set("b", "2");
  lru.set("c", "3");
  lru.set("b", "22");
  lru.set("b", "22");
  lru.set("x", "toolong");
  lru.delete("c");
  assert.deepEqual(evicted, ["a=1", "b=2", "x=toolong"]);
});
