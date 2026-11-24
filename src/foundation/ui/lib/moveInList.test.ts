import assert from "node:assert/strict";
import { test } from "vitest";
import { isNoopMove, moveInList } from "./moveInList";

test("moveInList: 前・後ろへ動かす", () => {
  assert.deepEqual(moveInList(["a", "b", "c", "d"], "a", "c", "before"), ["b", "a", "c", "d"]);
  assert.deepEqual(moveInList(["a", "b", "c", "d"], "a", "c", "after"), ["b", "c", "a", "d"]);
  assert.deepEqual(moveInList(["a", "b", "c", "d"], "d", "a", "before"), ["d", "a", "b", "c"]);
  assert.deepEqual(moveInList(["a", "b", "c", "d"], "b", "d", "after"), ["a", "c", "d", "b"]);
});

test("moveInList: 複数は並びの順のまま動かす", () => {
  assert.deepEqual(moveInList(["a", "b", "c", "d", "e"], ["d", "a"], "c", "after"), ["b", "c", "a", "d", "e"]);
  assert.deepEqual(moveInList(["a", "b", "c", "d", "e"], ["b", "d"], "a", "before"), ["b", "d", "a", "c", "e"]);
});

test("moveInList: 並びが変わらなければ null（自分の上・すぐ前の後ろ・すぐ後ろの前・target が動かす物の中・並びにない）", () => {
  const list = ["a", "b", "c"];
  assert.equal(moveInList(list, "b", "b", "before"), null);
  assert.equal(moveInList(list, "b", "a", "after"), null);
  assert.equal(moveInList(list, "b", "c", "before"), null);
  assert.equal(moveInList(list, ["a", "b"], "b", "after"), null);
  assert.equal(moveInList(list, "x", "a", "before"), null);
  assert.equal(moveInList(list, "a", "x", "before"), null);
  assert.equal(isNoopMove(list, "b", "a", "before"), false);
  assert.equal(isNoopMove(list, "b", "c", "after"), false);
});

test("moveInList: 比べ方を渡せる", () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const moved = moveInList(list, { id: 3 }, { id: 1 }, "before", (a, b) => a.id === b.id);
  assert.deepEqual(moved?.map((x) => x.id), [3, 1, 2]);
});
