import { test } from "node:test";
import assert from "node:assert/strict";
import { orderGroupBuckets, splitAtUngrouped, ungroupedPosition } from "./groupOrder";

test("ungroupedPosition: 覚えていなければボードは先頭・リストはいちばん下", () => {
  assert.equal(ungroupedPosition(-1, 3, false), 0);
  assert.equal(ungroupedPosition(-1, 3, true), 3);
});

test("ungroupedPosition: 覚えた位置はボードとリストで同じ。グループが減ったらいちばん下に寄せる", () => {
  assert.equal(ungroupedPosition(1, 3, false), 1);
  assert.equal(ungroupedPosition(1, 3, true), 1);
  assert.equal(ungroupedPosition(5, 2, false), 2);
  assert.equal(ungroupedPosition(0, 0, true), 0);
});

test("orderGroupBuckets: グループなしを指定の位置に入れ、グループの順は変えない", () => {
  const b = [
    { kind: "group", key: "a" },
    { kind: "group", key: "b" },
    { kind: "ungrouped", key: "none" },
  ];
  const keys = (at: number) => orderGroupBuckets(b, at).map((x) => x.key);
  assert.deepEqual(keys(0), ["none", "a", "b"]);
  assert.deepEqual(keys(1), ["a", "none", "b"]);
  assert.deepEqual(keys(2), ["a", "b", "none"]);
  assert.deepEqual(keys(9), ["a", "b", "none"]);
});

test("orderGroupBuckets: グループがなければグループなしだけ", () => {
  assert.deepEqual(orderGroupBuckets([{ kind: "ungrouped" }], 0), [{ kind: "ungrouped" }]);
});

test("splitAtUngrouped: すべてのグループの並びの中の位置で、出しているグループを前と後ろに分ける", () => {
  const all = [1, 2, 3, 4];
  const ids = (r: { before: number[]; after: number[] }) => [r.before, r.after];
  assert.deepEqual(ids(splitAtUngrouped(all, (g) => g, all, 2)), [[1, 2], [3, 4]]);
  assert.deepEqual(ids(splitAtUngrouped(all, (g) => g, all, 0)), [[], [1, 2, 3, 4]]);
  assert.deepEqual(ids(splitAtUngrouped(all, (g) => g, all, 4)), [[1, 2, 3, 4], []]);
  // 絞り込みで 2 を出していなくても、3 は「No Group」（位置 2）の後ろのまま
  assert.deepEqual(ids(splitAtUngrouped([1, 3], (g) => g, all, 2)), [[1], [3]]);
});
