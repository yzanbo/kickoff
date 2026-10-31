import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "./store.js";
import type { BusEvent } from "./types.js";

function setup() {
  const events: BusEvent[] = [];
  const store = new Store(":memory:", (e) => events.push(e));
  const project = store.createProject({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  return { store, events, project };
}

test("プロジェクトを作成すると既定値が入り、変更が通知される", () => {
  const { project, events } = setup();
  assert.equal(project.current_phase, "requirements");
  assert.equal(project.auto_commit, 1);
  assert.equal(events.at(-1)?.type, "project");
});

test("タスクの集計がプロジェクト一覧に反映される", () => {
  const { store, project } = setup();
  store.createTask({ project_id: project.id, phase: "implementation", title: "A" });
  const b = store.createTask({ project_id: project.id, phase: "implementation", title: "B" });
  store.updateTask(b.id, { status: "pr_open", pr_url: "https://github.com/x/y/pull/1", branch: "kickoff/task-2" });

  const [summary] = store.listProjects();
  assert.equal(summary.task_counts.todo, 1);
  assert.equal(summary.task_counts.pr_open, 1);
  assert.equal(store.getTask(b.id)?.branch, "kickoff/task-2");
});

test("中断された実行は起動時に失敗扱いになり、タスクは TODO に戻る", () => {
  const { store, project } = setup();
  const task = store.createTask({ project_id: project.id, phase: "implementation", title: "A", status: "in_progress" });
  const run = store.createRun({
    project_id: project.id,
    task_id: task.id,
    phase: "implementation",
    provider: "claude",
    title: "A",
    status: "running",
    model: null,
  });

  assert.equal(store.recoverInterruptedRuns(), 1);
  assert.equal(store.getRun(run.id)?.status, "failed");
  assert.equal(store.getTask(task.id)?.status, "todo");
});

test("実行イベントは JSON で保存され、順番どおりに読み出せる", () => {
  const { store, project } = setup();
  const run = store.createRun({
    project_id: project.id,
    task_id: null,
    phase: "requirements",
    provider: "claude",
    title: "壁打ち",
    status: "running",
    model: null,
  });
  store.addEvent(run.id, { type: "user", text: "こんにちは" });
  store.addEvent(run.id, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } });

  const events = store.listEvents(run.id);
  assert.deepEqual(
    events.map((e) => e.type),
    ["user", "tool_use"],
  );
  assert.deepEqual(events[1].data, { id: "t1", name: "Read", input: { file_path: "a.ts" } });
});

test("設定は既定値とマージされる", () => {
  const { store } = setup();
  assert.equal(store.getSettings().maxConcurrentRuns, 2);
  store.updateSettings({ maxConcurrentRuns: 4 });
  assert.equal(store.getSettings().maxConcurrentRuns, 4);
  assert.equal(store.getSettings().defaultProvider, "claude");
});

test("プロジェクトを削除するとタスクも消える", () => {
  const { store, project } = setup();
  store.createTask({ project_id: project.id, phase: "testing", title: "A" });
  store.deleteProject(project.id);
  assert.equal(store.listTasks(project.id).length, 0);
});
