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
  const start = [ev2("user", { text: "やって", message_uuid: "u0" })];
  const working = [...start, ev2("tool_use", { id: "w1", name: "TodoWrite", input: { todos: [{ content: "A", status: "completed" }, { content: "B", status: "in_progress" }] } })];
  assert.equal(todoVisibility(collectTodoList(working), ""), "full");
  const done = [...working, ev2("tool_use", { id: "w2", name: "TodoWrite", input: { todos: [{ content: "A", status: "completed" }, { content: "B", status: "completed" }] } }), ev2("result", { status: "completed" })];
  assert.equal(todoVisibility(collectTodoList(done), ""), "done");
  // すべて完了したあとに自分が次の指示を送ったら、前の作業の分はこれまでの ToDo に移り、ピルは出さない
  const next = [...done, ev2("user", { text: "次をお願い", message_uuid: "u1" })];
  const nextList = collectTodoList(next);
  assert.equal(todoVisibility(nextList, ""), "hidden");
  assert.deepEqual(nextList.history.map((g) => [g.promptId, g.items.map((t) => t.content)]), [[start[0].id, ["A", "B"]]]);
  // 手で隠した一覧は隠したまま、書き換わったらまた出す
  assert.equal(todoVisibility(collectTodoList(working), todoSignature(collectTodos(working))), "hidden");
  assert.equal(todoVisibility(collectTodoList(done), todoSignature(collectTodos(working))), "done");
  // 一覧がなければ出さない
  assert.equal(todoVisibility(collectTodoList([]), ""), "hidden");
});

let seq = 0;
/** Task を 1 件作る記録（呼び出しと「Task #n」の結果） */
const create = (ev3: ReturnType<typeof eventSequence>, id: string, subject: string) => [
  ev3("tool_use", { id: `c${id}-${subject}`, name: "TaskCreate", input: { subject } }),
  ev3("tool_result", { tool_use_id: `c${id}-${subject}`, content: `Task #${id} created successfully: ${subject}` }),
];
const update = (ev3: ReturnType<typeof eventSequence>, taskId: string, status: string) => ev3("tool_use", { id: `u${taskId}-${status}-${++seq}`, name: "TaskUpdate", input: { taskId, status } });

test("ToDo: Task は作業ごとに分け、前の作業で完了したものは指示ごとのこれまでの ToDo に（新しい指示が先）", () => {
  const e = eventSequence();
  const first = e("user", { text: "1 つ目", message_uuid: "a" });
  const tell = e("user", { text: "途中で伝えた", message_uuid: "t" });
  const events = [
    first,
    ...create(e, "1", "調べる"),
    tell,
    ...create(e, "2", "直す"),
    update(e, "1", "completed"),
    update(e, "2", "completed"),
    e("result", { status: "completed" }),
  ];
  const second = e("user", { text: "2 つ目", message_uuid: "b" });
  events.push(second, ...create(e, "3", "試す"), update(e, "3", "completed"), ...create(e, "4", "書く"), update(e, "4", "in_progress"));
  const list = collectTodoList(events);
  // いまの作業: この作業で完了したものと未完了（作業中に伝えた発言は同じ作業の続き）
  assert.deepEqual(list.items.map((t) => [t.content, t.status]), [["試す", "completed"], ["書く", "in_progress"]]);
  assert.deepEqual(list.history.map((g) => [g.promptId, g.items.map((t) => t.content)]), [[first.id, ["調べる", "直す"]]]);
  assert.deepEqual(list.stale, []);
});

test("ToDo: 未完了のまま、付けた作業のあと 2 回の作業で触られていないものは、前の作業から残っているものにする", () => {
  const e = eventSequence();
  const events = [e("user", { text: "1", message_uuid: "a" }), ...create(e, "1", "忘れられる"), ...create(e, "2", "終わる"), update(e, "2", "completed"), e("result", { status: "completed" })];
  // 付けた作業の終わりは数えない。次の作業が終わっても、まだいまの作業に数える（短い質問を 1 つ挟んだだけで消えないように）
  events.push(e("user", { text: "2", message_uuid: "b" }), ...create(e, "3", "新しい"), e("result", { status: "completed" }));
  assert.deepEqual(collectTodoList(events).items.map((t) => t.content), ["忘れられる", "新しい"]);
  events.push(e("user", { text: "3", message_uuid: "c" }), update(e, "3", "completed"), e("result", { status: "completed" }));
  const list = collectTodoList(events);
  assert.deepEqual(list.stale.map((t) => t.content), ["忘れられる"]);
  assert.deepEqual(list.items.map((t) => t.content), ["新しい"]);
  // 前の作業から残っているものだけでは、ピルを出し続けない
  events.push(e("user", { text: "4", message_uuid: "d" }));
  const later = collectTodoList(events);
  assert.deepEqual(later.items, []);
  assert.equal(todoVisibility(later, ""), "hidden");
});

test("ToDo: セッションが替わる（コンテキストの消去など）と、同じ番号の Task を前のものと混ぜない", () => {
  const e = eventSequence();
  const events = [
    e("user", { text: "1", message_uuid: "a" }),
    e("init", { session_id: "s1" }),
    ...create(e, "1", "前の 1"),
    update(e, "1", "completed"),
    ...create(e, "2", "前の 2"),
    e("result", { status: "completed" }),
    e("context_cleared", {}),
    e("user", { text: "2", message_uuid: "b" }),
    e("init", { session_id: "s2" }),
    ...create(e, "1", "新しい 1"),
  ];
  const list = collectTodoList(events);
  assert.deepEqual(list.items.map((t) => t.content), ["新しい 1"]);
  assert.deepEqual(list.history.flatMap((g) => g.items.map((t) => t.content)), ["前の 1"]);
  // 前のセッションで完了しなかったものは、もう AI が触れないので残っているものに
  assert.deepEqual(list.stale.map((t) => t.content), ["前の 2"]);
  // 消去の記録がなくても、セッションの ID が替われば締める
  const resumed = collectTodoList([e("init", { session_id: "x1" }), ...create(e, "1", "A"), e("init", { session_id: "x2" }), ...create(e, "1", "B")]);
  assert.deepEqual(resumed.items.map((t) => t.content), ["B"]);
  assert.deepEqual(resumed.stale.map((t) => t.content), ["A"]);
});

test("ToDo: TodoWrite の書き直しで消えた完了済みはこれまでの ToDo に残し、同じ文のものは付けた指示を引き継ぐ", () => {
  const e = eventSequence();
  const first = e("user", { text: "1", message_uuid: "a" });
  const write = (todos: object[]) => e("tool_use", { id: `w${++seq}`, name: "TodoWrite", input: { todos } });
  const events = [first, write([{ content: "A", status: "completed" }, { content: "B", status: "pending" }]), e("result", { status: "completed" })];
  const second = e("user", { text: "2", message_uuid: "b" });
  events.push(second, write([{ content: "B", status: "in_progress" }, { content: "C", status: "pending" }]));
  const list = collectTodoList(events);
  assert.deepEqual(list.items.map((t) => [t.content, t.promptId]), [["B", first.id], ["C", second.id]]);
  assert.deepEqual(list.history.map((g) => [g.promptId, g.items.map((t) => t.content)]), [[first.id, ["A"]]]);
});
