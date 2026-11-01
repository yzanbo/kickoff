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
  assert.deepEqual(summary.phase_task_counts.implementation, { total: 2, done: 0 });
  assert.deepEqual(summary.phase_task_counts.testing, { total: 0, done: 0 });
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

test("チャットのやり取りをキーワードで検索できる（範囲の絞り込み・記号のエスケープ）", () => {
  const { store, project } = setup();
  const other = store.createProject({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  const mk = (projectId: number, title: string) =>
    store.createRun({ project_id: projectId, task_id: null, phase: "requirements", provider: "claude", title, status: "completed", model: null });
  const a = mk(project.id, "ログインの相談");
  const b = mk(other.id, "別プロジェクト");
  store.addEvent(a.id, { type: "user", text: "ログイン方式は OAuth にしたい" });
  store.addEvent(a.id, { type: "text", text: "OAuth なら GitHub ログインが手軽です。100% 対応できます。" });
  store.addEvent(a.id, { type: "tool_use", id: "t", name: "Read", input: { file_path: "oauth.md" } });
  store.addEvent(b.id, { type: "user", text: "oauth の話" });

  const all = store.searchEvents("oauth");
  assert.equal(all.length, 3);
  assert.equal(all[0].run_title, "別プロジェクト");

  const inProject = store.searchEvents("OAuth", { projectId: project.id });
  assert.deepEqual(
    inProject.map((h) => h.type),
    ["text", "user"],
  );
  const hit = inProject[0];
  assert.equal(hit.snippet.slice(hit.match_start, hit.match_end), "OAuth");

  // % や _ はワイルドカードではなく文字として探す
  assert.equal(store.searchEvents("100%").length, 1);
  assert.equal(store.searchEvents("%").length, 1);
  assert.equal(store.searchEvents("", {}).length, 0);
  assert.equal(store.searchEvents("ログイン", { runId: b.id }).length, 0);
});

test("グループ: 作成順に並び、並べ替え・削除するとチャットはグループなしに戻る", () => {
  const { store, project, events } = setup();
  const a = store.createGroup(project.id, "コードレビュー");
  const b = store.createGroup(project.id, "調査");
  assert.deepEqual(store.listGroups(project.id).map((g) => g.name), ["コードレビュー", "調査"]);

  const run = store.createRun({
    project_id: project.id,
    task_id: null,
    phase: "implementation",
    provider: "claude",
    title: "レビュー依頼",
    status: "completed",
    model: null,
  });
  const before = store.getRun(run.id)!.updated_at;
  assert.equal(store.setRunGroup(run.id, a.id).group_id, a.id);
  // グループへ移しても、新しい順の並びは変わらない
  assert.equal(store.getRun(run.id)!.updated_at, before);

  store.reorderGroups(project.id, [b.id, a.id]);
  assert.deepEqual(store.listGroups(project.id).map((g) => g.name), ["調査", "コードレビュー"]);

  events.length = 0;
  store.deleteGroup(a.id);
  assert.equal(store.getRun(run.id)!.group_id, null);
  assert.deepEqual(events.map((e) => e.type), ["run", "group_deleted"]);
});

test("プロジェクトの既定は JSON で保存され、壊れていなければそのまま読める", () => {
  const { store, project } = setup();
  assert.deepEqual(project.defaults, {});
  const updated = store.updateProject(project.id, { defaults: { model: "haiku", effort: null, stage: "todo" } });
  assert.deepEqual(updated.defaults, { model: "haiku", effort: null, stage: "todo" });
});

test("プロジェクトの並び順: 作った順に付き、並べ替えられる", () => {
  const { store, project } = setup();
  const b = store.createProject({ name: "b", repo_path: "/tmp/b", provider: "claude" });
  assert.ok(b.position > project.position);
  store.reorderProjects([b.id, project.id]);
  assert.ok(store.getProject(b.id)!.position < store.getProject(project.id)!.position);
});
