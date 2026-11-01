import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../core/types.js";
import { collectSubagents } from "./subagents.js";

const ev = (id: number, type: RunEvent["type"], data: object): RunEvent =>
  ({ id, run_id: 1, type, data, created_at: "2026-11-01T00:00:00Z" }) as unknown as RunEvent;

test("サブエージェント: 呼び出し・通知・途中経過をまとめ、止まったものは中断にする", () => {
  const events = [
    ev(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "レビュー A", subagent_type: "general-purpose", model: "sonnet" } }),
    ev(2, "tool_use", { id: "tu2", name: "Task", input: { description: "調査 B" } }),
    ev(3, "subagent", { task_id: "t1", tool_use_id: "tu1", description: "", status: "completed", tokens: 78800 }),
    ev(4, "tool_result", { tool_use_id: "tu1", content: "ok", is_error: false }),
    ev(5, "tool_use", { id: "tu3", name: "Read", input: {} }),
  ];
  const running = collectSubagents(events, { tu2: { task_id: "t2", tool_use_id: "tu2", description: "調査 B", status: "running", tokens: 1200, last_tool: "Grep" } }, true);
  assert.equal(running.length, 2);
  assert.deepEqual(
    running.map((s) => [s.description, s.status, s.tokens, s.model ?? null, s.lastTool ?? null]),
    [
      ["レビュー A", "completed", 78800, "sonnet", null],
      ["調査 B", "running", 1200, null, "Grep"],
    ],
  );
  assert.equal(running[0].toolUseEventId, 1);

  const stopped = collectSubagents(events, {}, false);
  assert.equal(stopped[1].status, "stopped");
});
