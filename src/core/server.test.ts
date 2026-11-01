import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ApprovalCenter } from "./approvals.js";
import { Bus } from "./bus.js";
import type { AgentProvider, ProviderRunResult } from "./providers/types.js";
import { Runner } from "./runner.js";
import { createApp } from "./server.js";
import { Store } from "./store.js";
import type { ProviderId } from "./types.js";
import { UploadStore } from "./uploads.js";
import type { UsageMonitor } from "./usage.js";

const TOKEN = "t".repeat(32);
const AUTH = { authorization: `Bearer ${TOKEN}` };

/** すぐに完了する偽のプロバイダー */
class FakeProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Fake";
  readonly implemented = true;
  async status() {
    return { id: this.id, label: this.label, implemented: true, installed: true, loggedIn: true, detail: "" };
  }
  async run(): Promise<ProviderRunResult> {
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1 };
  }
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-server-test-"));

function setup() {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const uploads = new UploadStore(tempDir());
  const usage = { get: async () => ({ available: false }), refresh: async () => ({ available: false }) } as unknown as UsageMonitor;
  const provider = new FakeProvider();
  const providers = { claude: provider, codex: provider, gemini: provider } as Record<ProviderId, AgentProvider>;
  const runner = new Runner({ store, approvals, providers, usage, uploads, bus });
  const app = createApp({ store, bus, token: TOKEN, providers, usage, runner, approvals, uploads });
  const project = store.createProject({ name: "p", repo_path: tempDir(), provider: "claude" });

  /** トークン付きで API を呼び、JSON の応答を返す */
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await app.request(url, {
      method,
      headers: body === undefined ? AUTH : { ...AUTH, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
  return { app, store, runner, project, call };
}

const tick = () => new Promise((r) => setTimeout(r, 10));
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}

test("API はトークン（Bearer・Cookie）がないと 401。ペアリングで Cookie を渡す", async () => {
  const { app } = setup();
  assert.equal((await app.request("/api/health")).status, 401);
  const ok = await app.request("/api/health", { headers: AUTH });
  assert.deepEqual(await ok.json(), { ok: true, version: "0.1.0" });
  assert.equal((await app.request("/api/health", { headers: { cookie: `kickoff_token=${TOKEN}` } })).status, 200);

  assert.equal((await app.request("/pair?token=wrong")).status, 401);
  const paired = await app.request(`/pair?token=${TOKEN}`);
  assert.equal(paired.status, 302);
  assert.match(paired.headers.get("set-cookie") ?? "", /^kickoff_token=t+;/);
});

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

test("チャット・グループの API", async () => {
  const { call, project, store, runner } = setup();
  const other = store.createProject({ name: "o", repo_path: tempDir(), provider: "claude" });
  const group = await call("POST", `/api/projects/${project.id}/groups`, { name: "g" });
  assert.equal(group.status, 201);
  const otherGroup = (await call("POST", `/api/projects/${other.id}/groups`, { name: "x" })).body;

  // 本文も添付もなければ送れない。ほかのプロジェクトのグループには入れられない
  assert.equal((await call("POST", `/api/projects/${project.id}/runs`, { phase: "requirements" })).status, 400);
  const cross = await call("POST", `/api/projects/${project.id}/runs`, { phase: "requirements", prompt: "x", group_id: otherGroup.id });
  assert.deepEqual(cross, { status: 400, body: { error: "ほかのプロジェクトのグループには入れられません" } });

  const started = await call("POST", `/api/projects/${project.id}/runs`, { phase: "requirements", prompt: "こんにちは", group_id: group.body.id });
  assert.equal(started.status, 201);
  const runId: number = started.body.id;
  await until(() => !runner.isBusy(runId));
  assert.equal(store.getRun(runId)?.group_id, group.body.id);

  assert.equal((await call("GET", `/api/projects/${project.id}/runs`)).body.length, 1);
  assert.equal((await call("GET", "/api/runs")).body.length, 1);
  const detail = await call("GET", `/api/runs/${runId}`);
  assert.equal(detail.body.run.id, runId);
  assert.ok(detail.body.events.length > 0);
  assert.deepEqual(detail.body.approvals, []);
  assert.deepEqual(await call("GET", "/api/runs/999"), { status: 404, body: { error: "実行が見つかりません" } });
  assert.ok(Array.isArray((await call("GET", `/api/search?q=${encodeURIComponent("こんにちは")}&project_id=${project.id}`)).body));

  const renamed = await call("PATCH", `/api/runs/${runId}`, { title: "名前", stage: "todo", group_id: null });
  assert.equal(renamed.body.title, "名前");
  assert.equal(renamed.body.stage, "todo");
  assert.equal(renamed.body.group_id, null);
  assert.equal((await call("PATCH", `/api/runs/${runId}`, { group_id: otherGroup.id })).status, 400);
  assert.equal((await call("PATCH", `/api/runs/${runId}`, { group_id: group.body.id })).body.group_id, group.body.id);

  assert.equal((await call("POST", `/api/runs/${runId}/seen`)).body.attention, 0);
  assert.ok((await call("POST", `/api/runs/${runId}/archive`)).body.archived_at);
  assert.equal((await call("GET", `/api/projects/${project.id}/runs`)).body.length, 0);
  assert.equal((await call("GET", `/api/projects/${project.id}/runs?archived=1`)).body.length, 1);
  assert.equal((await call("POST", `/api/runs/${runId}/archive`, { archived: false })).body.archived_at, null);

  assert.equal((await call("POST", `/api/runs/${runId}/messages`, {})).status, 400);
  assert.equal((await call("POST", `/api/runs/${runId}/messages`, { text: "続き" })).status, 200);
  await until(() => !runner.isBusy(runId));
  assert.deepEqual((await call("POST", `/api/runs/${runId}/cancel`)).body, { ok: true });

  assert.deepEqual(
    (await call("PUT", `/api/projects/${project.id}/groups/order`, { ids: [group.body.id] })).body.map((g: { id: number }) => g.id),
    [group.body.id],
  );
  assert.equal((await call("PATCH", `/api/groups/${group.body.id}`, { name: "h" })).body.name, "h");
  assert.equal((await call("GET", `/api/projects/${project.id}/groups`)).body.length, 1);
  assert.deepEqual((await call("DELETE", `/api/groups/${group.body.id}`)).body, { ok: true });
  assert.equal(store.getRun(runId)?.group_id, null);
  assert.deepEqual(await call("PATCH", "/api/groups/999", { name: "x" }), { status: 404, body: { error: "グループが見つかりません" } });

  assert.deepEqual((await call("DELETE", `/api/runs/${runId}`)).body, { ok: true });
  assert.equal(store.getRun(runId), undefined);
});

test("添付・承認依頼・プロバイダー・使用枠の API", async () => {
  const { app, call } = setup();
  assert.deepEqual(await call("POST", "/api/uploads"), { status: 400, body: { error: "ファイルがありません" } });
  const form = new FormData();
  form.append("file", new File(["hello"], "a.txt", { type: "text/plain" }));
  const uploaded = await app.request("/api/uploads", { method: "POST", headers: AUTH, body: form });
  assert.equal(uploaded.status, 201);
  const [saved] = (await uploaded.json()) as { id: string; name: string }[];
  assert.equal(saved.name, "a.txt");
  // 画像と PDF 以外はダウンロードさせる
  const file = await app.request(`/api/uploads/${saved.id}?mime=text/plain`, { headers: AUTH });
  assert.equal(await file.text(), "hello");
  assert.equal(file.headers.get("content-type"), "application/octet-stream");
  assert.equal(file.headers.get("content-disposition"), "attachment; filename*=UTF-8''a.txt");
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await call("GET", `/api/uploads/${randomUUID()}`), { status: 404, body: { error: "ファイルが見つかりません" } });

  assert.deepEqual((await call("GET", "/api/approvals")).body, []);
  assert.deepEqual(await call("POST", "/api/approvals/nope", { action: "allow" }), {
    status: 404,
    body: { error: "この依頼はすでに回答済みか、中断されています" },
  });
  assert.equal((await call("POST", "/api/approvals/nope", { action: "maybe" })).status, 400);

  assert.equal((await call("GET", "/api/providers")).body.length, 3);
  assert.deepEqual((await call("GET", "/api/providers/claude/models")).body, []);
  assert.equal((await call("GET", "/api/providers/unknown/models")).status, 400);
  assert.deepEqual((await call("GET", "/api/usage")).body, { available: false });
  assert.deepEqual((await call("POST", "/api/usage/refresh")).body, { available: false });
});
