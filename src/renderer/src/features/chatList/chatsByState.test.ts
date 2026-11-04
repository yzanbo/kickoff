import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentState, Run } from "@shared/types";
import { runsByState } from "./StateChatsPopover";

const run = (id: number, state: AgentState, archived = false) =>
  ({ id, active_at: `2026-11-0${id}T00:00:00Z`, archived_at: archived ? "2026-11-01T00:00:00Z" : null, state }) as unknown as Run & { state: AgentState };
const runs = [run(1, "running"), run(2, "done"), run(3, "done", true), run(4, "needs_input")];
const stateOf = (r: Run) => (r as Run & { state: AgentState }).state;

test("runsByState: 初めは作業中・回答待ち・未読だけ（既読・アーカイブ済みは入れない）", () => {
  assert.deepEqual(
    runsByState(runs, stateOf).map((s) => [s.column, s.runs.map((r) => r.id)]),
    [
      ["running", [1]],
      ["needs_input", [4]],
    ],
  );
});

test("runsByState: all なら既読と、いちばん下にアーカイブ済みも並べる", () => {
  assert.deepEqual(
    runsByState(runs, stateOf, { all: true }).map((s) => [s.column, s.runs.map((r) => r.id)]),
    [
      ["running", [1]],
      ["needs_input", [4]],
      ["done", [2]],
      ["archived", [3]],
    ],
  );
});
