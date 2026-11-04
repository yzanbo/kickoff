import assert from "node:assert/strict";
import { test } from "node:test";
import { agentStateOf, boardColumnOf } from "@shared/chat/state";
import { Store } from "../../core/db/store.js";

function mk() {
  const store = new Store(":memory:");
  const project = store.createProject({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const run = store.createRun({ project_id: project.id, provider: "claude", title: "t", status: "running", model: null });
  return { store, run };
}

test("エージェントの状態は 回答待ち → エラー → 作業中 → 未読 → 既読 の優先順で決まる（失敗も見たら既読）", () => {
  const { store, run } = mk();
  assert.equal(agentStateOf(run, true), "needs_input");
  assert.equal(agentStateOf(run, false), "running");
  assert.equal(agentStateOf(store.updateRun(run.id, { status: "failed", attention: true }), false), "failed");
  assert.equal(agentStateOf(store.updateRun(run.id, { status: "failed", attention: false }), false), "done");
  assert.equal(agentStateOf(store.updateRun(run.id, { status: "completed", attention: true }), false), "attention");
  assert.equal(agentStateOf(store.updateRun(run.id, { attention: false }), false), "done");
});

test("カンバンの列は AI の状態だけで決まる（作業中 → 回答待ち → 未読（失敗も）→ 既読）", () => {
  const { store, run } = mk();
  assert.equal(boardColumnOf(agentStateOf(run, false)), "running");
  assert.equal(boardColumnOf(agentStateOf(run, true)), "needs_input");
  assert.equal(boardColumnOf(agentStateOf(store.updateRun(run.id, { status: "completed", attention: true }), false)), "review");
  assert.equal(boardColumnOf(agentStateOf(store.updateRun(run.id, { status: "failed", attention: true }), false)), "review");
  assert.equal(boardColumnOf(agentStateOf(store.updateRun(run.id, { status: "completed", attention: false }), false)), "done");
  assert.equal(boardColumnOf(agentStateOf(store.updateRun(run.id, { status: "failed", attention: false }), false)), "done");
});

test("アーカイブしたチャットは一覧に出ず、削除すると会話の記録も消える", () => {
  const { store, run } = mk();
  store.addEvent(run.id, { type: "user", text: "x" });
  store.updateRun(run.id, { archived_at: new Date().toISOString() });
  assert.equal(store.listRuns().length, 0);
  assert.equal(store.listRuns({ includeArchived: true }).length, 1);
  store.deleteRun(run.id);
  assert.equal(store.getRun(run.id), undefined);
  assert.equal(store.listEvents(run.id).length, 0);
});

test("新しいチャットは、推論の深さを決めていなければ指定しない（null のまま）。使わなくなった列は返さない", () => {
  const { run } = mk();
  assert.deepEqual({ effort: run.effort, permission_mode: run.permission_mode }, { effort: null, permission_mode: "default" });
  for (const key of ["phase", "task_id", "stage"]) assert.equal(key in run, false, key);
});
