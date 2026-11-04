import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "@shared/types";
import { collectTodos } from "./todoList";

let nextId = 1;
const ev = (type: string, data: object) => ({ id: nextId++, run_id: 1, type, data, created_at: "2026-11-03T00:00:00Z" }) as unknown as RunEvent;
const use = (name: string, input: object, id = `u${nextId}`) => ev("tool_use", { id, name, input });

test("ToDo: TodoWrite は最後に書いたものが今の一覧", () => {
  const todos = collectTodos([
    use("TodoWrite", { todos: [{ content: "A", status: "pending" }] }),
    use("TodoWrite", { todos: [{ content: "A", status: "completed" }, { content: "B", activeForm: "B をしています", status: "in_progress" }] }),
  ]);
  assert.deepEqual(
    todos.map((t) => [t.content, t.status, t.activeForm]),
    [["A", "completed", undefined], ["B", "in_progress", "B をしています"]],
  );
});

test("ToDo: TaskCreate で足し、TaskUpdate で状態を変え、deleted で消す。サブエージェントの分と失敗した作成は数えない", () => {
  const todos = collectTodos([
    use("TaskCreate", { subject: "調べる", activeForm: "調べています" }, "c1"),
    ev("tool_result", { tool_use_id: "c1", content: "Task #1 created successfully: 調べる" }),
    use("TaskCreate", { subject: "直す" }, "c2"),
    ev("tool_result", { tool_use_id: "c2", content: "Task #2 created successfully: 直す" }),
    use("TaskCreate", { subject: "消す" }, "c3"),
    ev("tool_result", { tool_use_id: "c3", content: "Task #3 created successfully: 消す" }),
    use("TaskCreate", { subject: "失敗" }, "c4"),
    ev("tool_result", { tool_use_id: "c4", content: "error", is_error: true }),
    ev("tool_use", { id: "s1", name: "TaskUpdate", input: { taskId: "2", status: "completed" }, parent: "sub" }),
    use("TaskUpdate", { taskId: "1", status: "completed" }),
    use("TaskUpdate", { taskId: "2", status: "in_progress" }),
    use("TaskUpdate", { taskId: "3", status: "deleted" }),
  ]);
  assert.deepEqual(
    todos.map((t) => [t.content, t.status]),
    [["調べる", "completed"], ["直す", "in_progress"]],
  );
});

test("ToDo: 何もなければ空", () => {
  assert.deepEqual(collectTodos([use("Bash", { command: "ls" })]), []);
});
