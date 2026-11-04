import assert from "node:assert/strict";
import { test } from "node:test";
import { createValueCell } from "./valueCell";

test("createValueCell: 入れた値を返し、変わったときだけ知らせる。やめたら知らせない", () => {
  const cell = createValueCell({ n: 1 });
  let calls = 0;
  const stop = cell.subscribe(() => calls++);
  const first = cell.get();
  cell.set(first);
  assert.equal(calls, 0);
  cell.set({ n: 2 });
  assert.equal(calls, 1);
  assert.equal(cell.get().n, 2);
  stop();
  cell.set({ n: 3 });
  assert.equal(calls, 1);
});
