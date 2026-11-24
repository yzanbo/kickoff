import assert from "node:assert/strict";
import { test } from "vitest";
import { cycleValue } from "./cycleValue";

test("cycleValue: 次・前の値。端では反対の端へ。並びになければ先頭から数える", () => {
  assert.equal(cycleValue(["a", "b", "c"], "a", 1), "b");
  assert.equal(cycleValue(["a", "b", "c"], "c", 1), "a");
  assert.equal(cycleValue(["a", "b", "c"], "a", -1), "c");
  assert.equal(cycleValue(["a", "b", "c"], "x", 1), "b");
});
