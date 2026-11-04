import assert from "node:assert/strict";
import { test } from "node:test";
import { addKeys, rangeOf } from "./useMultiSelect";

const order = ["a", "b", "c", "d", "e"];

test("rangeOf: 起点から押したものまで（どちら向きでも並びの順）", () => {
  assert.deepEqual(rangeOf(order, "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(rangeOf(order, "d", "b"), ["b", "c", "d"]);
  assert.deepEqual(rangeOf(order, "c", "c"), ["c"]);
});

test("rangeOf: 起点がない・並びに見つからなければ、押したものだけ", () => {
  assert.deepEqual(rangeOf(order, null, "c"), ["c"]);
  assert.deepEqual(rangeOf(order, "x", "c"), ["c"]);
  assert.deepEqual(rangeOf(order, "a", "x"), ["x"]);
});

test("addKeys: 選んでいるものに足す（減らさず、重ねない）", () => {
  assert.deepEqual(addKeys(["a", "e"], ["b", "c"]), ["a", "e", "b", "c"]);
  assert.deepEqual(addKeys(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
});
