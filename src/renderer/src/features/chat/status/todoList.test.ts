import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import { collectTodoList, collectTodos, todoSignature, todoVisibility } from "./todoList";

const ev = eventSequence();
let tools = 0;
const use = (name: string, input: object, id = `u${++tools}`) => ev("tool_use", { id, name, input });

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

test("ToDo のピル: すべて完了なら控えめに、そのあと次の指示を送ったら隠す。手で隠した一覧は書き換わるまで隠す", () => {
  const ev2 = eventSequence();
  const working = [ev2("tool_use", { id: "w1", name: "TodoWrite", input: { todos: [{ content: "A", status: "completed" }, { content: "B", status: "in_progress" }] } })];
  assert.equal(todoVisibility(collectTodoList(working), working, ""), "full");
  const done = [...working, ev2("tool_use", { id: "w2", name: "TodoWrite", input: { todos: [{ content: "A", status: "completed" }, { content: "B", status: "completed" }] } })];
  const doneList = collectTodoList(done);
  assert.equal(doneList.changedAt, done[1].id);
  assert.equal(todoVisibility(doneList, done, ""), "done");
  // すべて完了したあとに自分が次の指示を送ったら、前の作業の一覧として隠す
  const next = [...done, ev2("user", { text: "次をお願い", message_uuid: "u1" })];
  assert.equal(todoVisibility(collectTodoList(next), next, ""), "hidden");
  // 手で隠した一覧は隠したまま、書き換わったらまた出す
  assert.equal(todoVisibility(collectTodoList(working), working, todoSignature(collectTodos(working))), "hidden");
  assert.equal(todoVisibility(doneList, done, todoSignature(collectTodos(working))), "done");
  // 一覧がなければ出さない
  assert.equal(todoVisibility(collectTodoList([]), [], ""), "hidden");
});
