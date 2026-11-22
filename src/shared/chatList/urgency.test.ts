import assert from "node:assert/strict";
import { test } from "vitest";
import { boardColumnOf, STATE_STRENGTH } from "@shared/chat/state";
import { ACTIVE_URGENCY, byUrgency, URGENCY_ORDER } from "./urgency";

test("URGENCY_ORDER: ボードの列の順（作業中 → 回答待ち → 未読 → 既読）で、どの状態の列も入っている", () => {
  assert.deepEqual([...URGENCY_ORDER], ["running", "needs_input", "unread", "read"]);
  for (const state of STATE_STRENGTH) assert.ok((URGENCY_ORDER as readonly string[]).includes(boardColumnOf(state)), state);
  assert.deepEqual(ACTIVE_URGENCY, ["running", "needs_input", "unread"]);
});

test("byUrgency: 急ぐものが前", () => {
  assert.deepEqual(["read", "unread", "running", "needs_input"].sort(byUrgency as (a: string, b: string) => number), ["running", "needs_input", "unread", "read"]);
});
