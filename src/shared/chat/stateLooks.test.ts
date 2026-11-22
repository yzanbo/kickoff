import assert from "node:assert/strict";
import { test } from "vitest";
import { STATE_STRENGTH } from "./state";
import { COLUMN_LOOKS, STATE_LOOKS, summarizeStates } from "./stateLooks";

test("summarizeStates: STATE_STRENGTH の順でいちばん強い状態を印にする", () => {
  assert.equal(summarizeStates(["read", "unread", "running"]).mark, "running");
  assert.equal(summarizeStates(["running", "needs_input"]).mark, "needs_input");
  assert.equal(summarizeStates(["read", "failed", "unread"]).mark, "failed");
  // どの 2 つを並べても、強い順の先のほうが勝つ
  for (const [i, strong] of STATE_STRENGTH.entries()) {
    for (const weak of STATE_STRENGTH.slice(i + 1)) assert.equal(summarizeStates([weak, strong]).mark, strong);
  }
});

test("summarizeStates: 状態ごとの数が合い、空なら印は null", () => {
  assert.deepEqual(summarizeStates(["unread", "unread", "read"]).counts, { needs_input: 0, failed: 0, unread: 2, running: 0, read: 1 });
  assert.deepEqual(summarizeStates([]), { mark: null, counts: { needs_input: 0, failed: 0, unread: 0, running: 0, read: 0 } });
});

test("列の文と色は、同じ状態の文と色と同じ", () => {
  for (const column of ["running", "needs_input", "unread", "read"] as const) assert.deepEqual(COLUMN_LOOKS[column], STATE_LOOKS[column]);
});
