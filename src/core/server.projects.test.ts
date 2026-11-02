// API のテスト: 設定・プロジェクト・タスク・成果物、プロジェクトの固定・アーカイブ・色（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, tempDir } from "./testing/testServer.js";

test("設定・プロジェクト・タスク・成果物の API", async () => {
  const { call, project, store } = setup();
  assert.equal((await call("PUT", "/api/settings", { maxConcurrentRuns: 3 })).body.maxConcurrentRuns, 3);
  const invalid = await call("PUT", "/api/settings", { maxConcurrentRuns: 99 });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "入力が正しくありません");
  assert.equal((await call("GET", "/api/settings")).body.maxConcurrentRuns, 3);
  const status = await call("GET", "/api/status");
  assert.equal(status.body.version, "0.1.0");
  assert.equal(status.body.agents.max, 3);
  // 上限なしは null で保存する
  assert.equal((await call("PUT", "/api/settings", { maxConcurrentRuns: null })).body.maxConcurrentRuns, null);
  assert.equal((await call("GET", "/api/status")).body.agents.max, null);
  await call("PUT", "/api/settings", { maxConcurrentRuns: 3 });

  assert.deepEqual(
    (await call("GET", "/api/projects")).body.map((p: { id: number }) => p.id),
    [project.id],
  );
  assert.equal((await call("GET", `/api/projects/${project.id}`)).body.name, "p");
  assert.deepEqual(await call("GET", "/api/projects/999"), { status: 404, body: { error: "プロジェクトが見つかりません" } });

  const patched = await call("PATCH", `/api/projects/${project.id}`, { name: "q", write_scopes: { requirements: ["docs/", "docs"] } });
  assert.equal(patched.body.name, "q");
  assert.deepEqual(patched.body.write_scopes.requirements, ["docs"]);
  const outside = await call("PATCH", `/api/projects/${project.id}`, { write_scopes: { schedule: ["../x"] } });
  assert.equal(outside.status, 400);
  assert.equal(outside.body.error, "リポジトリの外のフォルダは指定できません: ../x");
  const missing = await call("PATCH", `/api/projects/${project.id}`, { references: [{ path: "/no/such/kickoff/path" }] });
  assert.deepEqual(missing, { status: 400, body: { error: "見つかりません: /no/such/kickoff/path" } });
  const refs = await call("PATCH", `/api/projects/${project.id}`, { references: [{ path: project.repo_path }, { path: project.repo_path }] });
  assert.deepEqual(refs.body.references, [{ path: project.repo_path, kind: "folder" }]);

  const other = store.createProject({ name: "o", repo_path: tempDir(), provider: "claude" });
  // 一覧は更新順。サイドバーの並び順は position で持つ
  assert.deepEqual((await call("PUT", "/api/projects/order", { ids: [other.id, project.id] })).body, { ok: true });
  const positions = new Map((await call("GET", "/api/projects")).body.map((p: { id: number; position: number }) => [p.id, p.position]));
  assert.deepEqual([positions.get(other.id), positions.get(project.id)], [1, 2]);
  assert.deepEqual((await call("DELETE", `/api/projects/${other.id}`)).body, { ok: true });
  assert.equal(store.getProject(other.id), undefined);

  const inspected = await call("GET", `/api/workspace/inspect?path=${encodeURIComponent(project.repo_path)}`);
  assert.equal(inspected.status, 200);
  assert.ok("registered_project_id" in inspected.body);
  // フォルダの指定がなければ 400（起動したフォルダを点検しない）
  assert.equal((await call("GET", "/api/workspace/inspect")).status, 400);
  assert.equal((await call("GET", "/api/workspace/inspect?path=%20")).status, 400);

  const task = await call("POST", `/api/projects/${project.id}/tasks`, { phase: "implementation", title: "t" });
  assert.equal(task.status, 201);
  assert.equal(task.body.priority, 2);
  assert.equal(task.body.created_by, "user");
  assert.equal((await call("PATCH", `/api/tasks/${task.body.id}`, { status: "done" })).body.status, "done");
  assert.equal((await call("GET", `/api/projects/${project.id}/tasks`)).body.length, 1);
  assert.deepEqual((await call("DELETE", `/api/tasks/${task.body.id}`)).body, { ok: true });
  assert.deepEqual(await call("PATCH", "/api/tasks/999", {}), { status: 404, body: { error: "タスクが見つかりません" } });

  assert.deepEqual((await call("GET", `/api/projects/${project.id}/artifacts`)).body, []);
  assert.deepEqual(await call("GET", "/api/artifacts/999"), { status: 404, body: { error: "成果物が見つかりません" } });
});

test("プロジェクトを上に固定する・しまう（アーカイブ）・戻す", async () => {
  const { call, project } = setup();
  const pinned = (await call("PATCH", `/api/projects/${project.id}`, { pinned: true })).body;
  assert.equal(pinned.pinned, 1);
  const archived = (await call("PATCH", `/api/projects/${project.id}`, { archived: true })).body;
  assert.ok(archived.archived_at);
  // しまったままもう一度しまっても、しまった日時は変わらない
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { archived: true })).body.archived_at, archived.archived_at);
  const restored = (await call("PATCH", `/api/projects/${project.id}`, { archived: false, pinned: false })).body;
  assert.equal(restored.archived_at, null);
  assert.equal(restored.pinned, 0);
});

test("プロジェクトの色: 一覧の色だけに変えられる", async () => {
  const { call, project } = setup();
  assert.ok(typeof project.hue === "number");
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { hue: 222 })).body.hue, 222);
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { hue: 100 })).status, 400);
});
