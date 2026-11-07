import { test } from "node:test";
import assert from "node:assert/strict";
import { orderGroupBuckets, ungroupedPosition } from "./groupOrder";

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
