import assert from "node:assert/strict";
import { test } from "node:test";
import { currentKeyed, mergeKeyed, type KeyedResult } from "./useKeyedAsync";

const same = (a: number[], b: number[]) => a.join() === b.join();

test("mergeKeyed: 新しい key の結果は、そのまま覚える", () => {
  const next = mergeKeyed(undefined, "a", [1], same);
  assert.deepEqual(next, { key: "a", data: [1] });
});

test("mergeKeyed: 同じ key で中身も同じなら、前の値のまま（描き直さない）", () => {
  const prev: KeyedResult<number[]> = { key: "a", data: [1, 2] };
  assert.equal(mergeKeyed(prev, "a", [1, 2], same), prev);
  assert.notEqual(mergeKeyed(prev, "a", [1, 3], same), prev);
});

test("mergeKeyed: 別の key・失敗のあと・比べ方なしなら、新しい値に置き換える", () => {
  const prev: KeyedResult<number[]> = { key: "a", data: [1] };
  assert.deepEqual(mergeKeyed(prev, "b", [1], same), { key: "b", data: [1] });
  assert.deepEqual(mergeKeyed({ key: "a", error: "失敗" }, "a", [1], same), { key: "a", data: [1] });
  assert.notEqual(mergeKeyed(prev, "a", [1]), prev);
});

test("currentKeyed: いまの key の結果だけを出し、別の key のものは読み込み中（undefined）にする", () => {
  const state: KeyedResult<string> = { key: "a", data: "x" };
  assert.equal(currentKeyed(state, "a"), state);
  assert.equal(currentKeyed(state, "b"), undefined);
  assert.equal(currentKeyed(undefined, "a"), undefined);
  assert.deepEqual(currentKeyed({ key: "a", error: "失敗" }, "a"), { key: "a", error: "失敗" });
});
