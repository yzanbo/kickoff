import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentState, Chat } from "@shared/types";
import { byColumn, type BoardEntry } from "./boardColumns";

const entry = (id: number, state: AgentState): BoardEntry => ({ chat: { id } as Chat, state });

test("byColumn: 状態からカンバンの列に分ける（未読と失敗は同じ列。空の列も Map に入る）", () => {
  const map = byColumn([entry(1, "running"), entry(2, "needs_input"), entry(3, "unread"), entry(4, "failed"), entry(5, "read"), entry(6, "running")]);
  const ids = (column: Parameters<typeof map.get>[0]) => map.get(column)?.map((e) => e.chat.id);
  assert.deepEqual(ids("running"), [1, 6]);
  assert.deepEqual(ids("needs_input"), [2]);
  assert.deepEqual(ids("unread"), [3, 4]);
  assert.deepEqual(ids("read"), [5]);
  assert.deepEqual([...byColumn([]).values()].map((list) => list.length), [0, 0, 0, 0]);
});
