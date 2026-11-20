import assert from "node:assert/strict";
import { test } from "vitest";
import { cellReader, createCell } from "./cell";

test("createCell: 入れた値を返し、変わったときだけ知らせる。やめたら知らせない", () => {
  const cell = createCell({ n: 1 });
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

test("createCell: 関数を渡すと前の値から作り、equals で同じなら知らせない", () => {
  const cell = createCell({ n: 1 }, { equals: (a, b) => a.n === b.n });
  let calls = 0;
  cell.subscribe(() => calls++);
  cell.set((prev) => ({ n: prev.n }));
  assert.equal(calls, 0);
  cell.set((prev) => ({ n: prev.n + 1 }));
  assert.deepEqual([calls, cell.get().n], [1, 2]);
});

test("cellReader: 選んだ値が equals で同じなら、前の値をそのまま返す（描き直さない）", () => {
  const cell = createCell({ items: ["a"], other: 0 });
  const read = cellReader(cell, (v) => v.items.slice(), (a, b) => a.join() === b.join());
  const first = read();
  cell.set((v) => ({ ...v, other: 1 }));
  assert.equal(read(), first);
  cell.set((v) => ({ ...v, items: ["a", "b"] }));
  assert.deepEqual(read(), ["a", "b"]);
  assert.notEqual(read(), first);
});
