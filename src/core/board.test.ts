import assert from "node:assert/strict";
import { test } from "node:test";
import { agentStateOf, stageOf } from "./board.js";
import { Store } from "./store.js";

function mk() {
  const store = new Store(":memory:");
  const project = store.createProject({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const run = store.createRun({ project_id: project.id, task_id: null, phase: "implementation", provider: "claude", title: "t", status: "running", model: null });
  return { store, run };
}

test("エージェントの状態は 回答待ち → エラー → 作業中 → 確認待ち → 待機中 の優先順で決まる", () => {
  const { store, run } = mk();
  assert.equal(agentStateOf(run, true), "needs_input");
  assert.equal(agentStateOf(run, false), "running");
  assert.equal(agentStateOf(store.updateRun(run.id, { status: "failed", attention: 1 }), false), "failed");
  assert.equal(agentStateOf(store.updateRun(run.id, { status: "completed", attention: 1 }), false), "attention");
  assert.equal(agentStateOf(store.updateRun(run.id, { attention: 0 }), false), "done");
});

test("動かしていないチャットは、確認待ちならレビュー列、それ以外は対応中の列に置く", () => {
  const { store, run } = mk();
  const done = store.updateRun(run.id, { status: "completed", attention: 1 });
  assert.equal(stageOf(done, agentStateOf(done, false)), "review");
  assert.equal(stageOf(run, "running"), "doing");
  const moved = store.updateRun(run.id, { stage: "todo" });
  assert.equal(stageOf(moved, agentStateOf(moved, false)), "todo");
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

test("既定のままなら、セクションの既定の推論の深さと権限モードを使う", async () => {
  const { effectiveEffort, effectivePermission } = await import("./sectionDefaults.js");
  assert.equal(effectiveEffort("requirements", null, null), "high");
  assert.equal(effectiveEffort("schedule", null), "medium");
  assert.equal(effectiveEffort("schedule", "max"), "max");
  assert.equal(effectivePermission("implementation", "phase"), "acceptEdits");
  assert.equal(effectivePermission("deployment", "phase", null), "default");
  assert.equal(effectivePermission("deployment", "auto"), "auto");
});
