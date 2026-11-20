import assert from "node:assert/strict";
import { test } from "vitest";
import { createKeyedSelector, createSelector } from "./selector";

test("createSelector: 入力が同じ参照なら同じ結果、変われば前の結果を添えて作り直す", () => {
  const prevs: (number[] | undefined)[] = [];
  const select = createSelector((list: number[], min: number, prev: number[] | undefined) => (prevs.push(prev), list.filter((n) => n >= min)));
  const list = [1, 2, 3];
  const first = select(list, 2);
  assert.equal(select(list, 2), first);
  const second = select([...list], 2);
  assert.notEqual(second, first);
  assert.deepEqual(prevs, [undefined, first]);
});

test("createKeyedSelector: key ごとに覚え、forget した key は前の結果なしで作り直す", () => {
  const prevs: (number[] | undefined)[] = [];
  const view = createKeyedSelector((key: number, list: number[], prev: number[] | undefined) => (prevs.push(prev), list.filter((n) => n === key)));
  const list = [1, 2, 2];
  const one = view.get(1, list);
  const two = view.get(2, list);
  assert.equal(view.get(1, list), one);
  assert.equal(view.get(2, list), two);
  view.forget(1);
  assert.notEqual(view.get(1, list), one);
  assert.deepEqual(prevs, [undefined, undefined, undefined]);
});
