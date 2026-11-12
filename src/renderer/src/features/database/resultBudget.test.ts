import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateRowsBytes, pickEvictions } from "./resultBudget";

test("estimateRowsBytes: 文字は 2 バイト・ほかは決まった大きさで数える", () => {
  assert.equal(estimateRowsBytes([]), 0);
  assert.equal(estimateRowsBytes([["ab", 1, null]]), 16 + (16 + 4) + (16 + 8) + (16 + 8));
  assert.equal(estimateRowsBytes([[{ long: true, head: "abc", chars: 9 }]]), 16 + 16 + 6 + 16);
});

test("pickEvictions: 裏のタブを裏に回った古い順に、合計が上限以下になるまで捨てる（見ているタブ・0 のタブは捨てない）", () => {
  const entries = [
    { key: "active", bytes: 100, hiddenAt: null },
    { key: "old", bytes: 40, hiddenAt: 1 },
    { key: "mid", bytes: 40, hiddenAt: 2 },
    { key: "new", bytes: 40, hiddenAt: 3 },
    { key: "empty", bytes: 0, hiddenAt: 0 },
  ];
  assert.deepEqual(pickEvictions(entries, 200), []);
  assert.deepEqual(pickEvictions(entries, 80), ["old"]);
  assert.deepEqual(pickEvictions(entries, 50), ["old", "mid"]);
  assert.deepEqual(pickEvictions(entries, 0), ["old", "mid", "new"]);
});
