import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentState, Run } from "../../../../core/types";
import { byColumn, type BoardEntry } from "./boardColumns";

const entry = (id: number, state: AgentState): BoardEntry => ({ run: { id } as Run, state });

test("byColumn: 状態からカンバンの列に分ける（確認待ちと失敗は同じ列。空の列も Map に入る）", () => {
  const map = byColumn([entry(1, "running"), entry(2, "needs_input"), entry(3, "attention"), entry(4, "failed"), entry(5, "done"), entry(6, "running")]);
  const ids = (column: Parameters<typeof map.get>[0]) => map.get(column)?.map((e) => e.run.id);
  assert.deepEqual(ids("running"), [1, 6]);
  assert.deepEqual(ids("needs_input"), [2]);
  assert.deepEqual(ids("review"), [3, 4]);
  assert.deepEqual(ids("done"), [5]);
  assert.deepEqual([...byColumn([]).values()].map((list) => list.length), [0, 0, 0, 0]);
});
