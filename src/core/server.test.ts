import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ApprovalCenter } from "./approvals.js";
import { Bus } from "./bus.js";
import { startHttpServer, stopHttpServer } from "./httpServer.js";
import type { AgentProvider, ProviderRunResult } from "./providers/types.js";
import { Runner } from "./runner.js";
import { createApp } from "./server.js";
import { Store } from "./store.js";
import type { ProviderId, SlashCommandOption } from "./types.js";
import { UploadStore } from "./uploads.js";
import { ServiceUsageMonitor } from "./serviceUsage/index.js";
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
  /** 最後に動かした作業フォルダ（チャットの作業場所の確かめに使う） */
  lastCwd = "";
  async run(params: { cwd: string }): Promise<ProviderRunResult> {
    this.lastCwd = params.cwd;
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1 };
  }
  /** チャット欄の / のコマンド（返すものと、調べた作業フォルダ） */
  commandList: SlashCommandOption[] = [];
  lastCommandsCwd = "";
  async commands(cwd: string) {
    this.lastCommandsCwd = cwd;
    return this.commandList;
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
  // ほかのサービスは、ネットワークに出ない偽物にする
  let codexCalls = 0;
  const serviceUsage = new ServiceUsageMonitor(usage, [
    {
      id: "codex",
      label: "Codex",
      fetch: async () => {
        codexCalls++;
        return { id: "codex", label: "Codex", status: "ok", plan: "plus", account: null, windows: [], notes: [], fetched_at: new Date().toISOString() };
      },
    },
    { id: "cursor", label: "Cursor", fetch: async () => Promise.reject(new Error("つながりません")) },
  ]);
  const app = createApp({ store, bus, token: TOKEN, providers, usage, serviceUsage, runner, approvals, uploads });
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
  return { app, store, runner, project, call, provider, codexCalls: () => codexCalls };
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

test("リアルタイム配信（SSE）は、つないだらすぐ最初の行を送る", async () => {
  const { app } = setup();
  const res = await app.request("/api/events", { headers: AUTH });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body!.getReader();
  const first = await Promise.race([reader.read(), new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 1000))]);
  assert.notEqual(first, "timeout", "最初の行が届きませんでした");
  if (first !== "timeout") assert.equal(new TextDecoder().decode(first.value), "event: ping\ndata: \n\n");
  await reader.cancel();
});

test("サーバーを止めるときは、開いたままのリアルタイム配信の接続も切る（終了が止まらない）", async () => {
  const { app } = setup();
  const server = await startHttpServer(app, { port: 0, host: "127.0.0.1" });
  const { port } = server.address() as AddressInfo;
  // 応答ヘッダーがすぐ届く（届かないと fetch が返らない）
  const res = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: AUTH });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  await reader.read();
  const stopped = await Promise.race([stopHttpServer(server).then(() => "stopped"), new Promise((r) => setTimeout(() => r("timeout"), 2000))]);
  assert.equal(stopped, "stopped");
  await reader.cancel().catch(() => {});
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
  // 絞り込み・件数が数でなければ 400（NaN を SQL に入れない）。件数の上限は 1000 に丸める
  assert.equal((await call("GET", "/api/search?q=a&project_id=x")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&run_id=")).status, 200);
  assert.equal((await call("GET", "/api/runs?limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/runs?limit=0")).status, 400);
  assert.equal((await call("GET", "/api/runs?limit=5000")).body.length, 1);
  assert.equal((await call("GET", "/api/approvals?project_id=x")).status, 400);
  assert.deepEqual((await call("GET", `/api/approvals?project_id=${project.id}`)).body, []);

  // カンバンの列（stage）は AI の状態で決まるので、送っても変わらない
  const renamed = await call("PATCH", `/api/runs/${runId}`, { title: "名前", stage: "todo", group_id: null });
  assert.equal(renamed.body.title, "名前");
  assert.equal(renamed.body.stage, null);
  assert.equal(renamed.body.group_id, null);
  assert.equal((await call("PATCH", `/api/runs/${runId}`, { group_id: otherGroup.id })).status, 400);
  assert.equal((await call("PATCH", `/api/runs/${runId}`, { group_id: group.body.id })).body.group_id, group.body.id);

  assert.equal((await call("POST", `/api/runs/${runId}/seen`)).body.attention, 0);
  // 未読にする・既読にする: 印だけを変え、最後に動いた時刻（並び順）は変えない
  const updatedAt = store.getRun(runId)?.updated_at;
  assert.equal((await call("POST", `/api/runs/${runId}/unseen`)).body.attention, 1);
  assert.equal(store.getRun(runId)?.updated_at, updatedAt);
  assert.equal((await call("POST", `/api/runs/${runId}/seen`)).body.attention, 0);
  assert.equal(store.getRun(runId)?.updated_at, updatedAt);
  // サイドバーの上に固定する・やめる: 並び順（最後に動いた時刻）は変えない
  assert.equal((await call("POST", `/api/runs/${runId}/pin`, { pinned: true })).body.pinned, 1);
  assert.equal(store.getRun(runId)?.updated_at, updatedAt);
  assert.equal((await call("POST", `/api/runs/${runId}/pin`, { pinned: false })).body.pinned, 0);
  assert.equal((await call("POST", `/api/runs/${runId}/pin`, {})).status, 400);
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

test("Git の変更の API（状態と、ファイルごとの差分）", async () => {
  const { call, project } = setup();
  // Git で管理されていないフォルダ
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status`)).body, { repo: false });

  const repo = project.repo_path;
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo });
  git("init", "-b", "main");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  fs.writeFileSync(path.join(repo, "b.txt"), "bee\n");
  git("add", ".");
  git("commit", "-m", "init");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\ntwo\n");
  fs.writeFileSync(path.join(repo, "b.txt"), "bee!\n");
  git("add", "b.txt");
  fs.writeFileSync(path.join(repo, "new.txt"), "hello\n");

  const status = (await call("GET", `/api/projects/${project.id}/git/status`)).body;
  assert.equal(status.repo, true);
  assert.equal(status.branch, "main");
  assert.deepEqual(status.staged, [{ path: "b.txt", kind: "M" }]);
  assert.deepEqual(status.unstaged, [
    { path: "a.txt", kind: "M" },
    { path: "new.txt", kind: "U" },
  ]);

  const unstaged = (await call("GET", `/api/projects/${project.id}/git/diff?path=a.txt`)).body;
  assert.match(unstaged.diff, /^\+two$/m);
  assert.equal(unstaged.binary, false);
  const staged = (await call("GET", `/api/projects/${project.id}/git/diff?path=b.txt&staged=1`)).body;
  assert.match(staged.diff, /^-bee$/m);
  assert.match(staged.diff, /^\+bee!$/m);
  // 未追跡のファイルは、すべて追加として出す
  const untracked = (await call("GET", `/api/projects/${project.id}/git/diff?path=new.txt`)).body;
  assert.match(untracked.diff, /^\+hello$/m);
  // リポジトリの外は読ませない
  assert.equal((await call("GET", `/api/projects/${project.id}/git/diff?path=../outside.txt`)).status, 400);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/diff?path=/etc/hosts`)).status, 400);

  // エクスプローラー: 管理しているファイル・未追加のファイル。無視しているフォルダは中を開かずに 1 つ
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
  fs.mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "x\n");
  const files = (await call("GET", `/api/projects/${project.id}/files`)).body;
  assert.deepEqual(files.files, [".gitignore", "a.txt", "b.txt", "new.txt"]);
  assert.deepEqual(files.ignored, [{ path: "node_modules", dir: true }]);
  assert.equal(files.truncated, false);
  // ファイルの中身（リポジトリの外・外を指すリンクは読ませない）
  const opened = (await call("GET", `/api/projects/${project.id}/file?path=a.txt`)).body;
  assert.deepEqual({ ...opened, hash: undefined }, { content: "one\ntwo\n", hash: undefined, binary: false, truncated: false });
  assert.match(opened.hash, /^[0-9a-f]{40}$/);
  // 保存: 開いたときの指紋が同じなら書く。ほかで変わっていれば 409 で上書きしない。null なら上書きする
  const saved = await call("PUT", `/api/projects/${project.id}/file`, { path: "a.txt", content: "one\nTWO\n", base_hash: opened.hash });
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\nTWO\n");
  const stale = await call("PUT", `/api/projects/${project.id}/file`, { path: "a.txt", content: "mine\n", base_hash: opened.hash });
  assert.equal(stale.status, 409);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\nTWO\n");
  assert.equal((await call("PUT", `/api/projects/${project.id}/file`, { path: "a.txt", content: "one\ntwo\n", base_hash: null })).status, 200);
  assert.equal((await call("PUT", `/api/projects/${project.id}/file`, { path: "../outside.txt", content: "x", base_hash: null })).status, 400);
  assert.equal((await call("GET", `/api/projects/${project.id}/file?path=../outside.txt`)).status, 400);
  fs.symlinkSync("/etc/hosts", path.join(repo, "link.txt"));
  assert.equal((await call("GET", `/api/projects/${project.id}/file?path=link.txt`)).status, 400);

  // ファイルの中を探す（大文字・小文字・単語単位・正規表現。無視しているフォルダは探さない）
  fs.writeFileSync(path.join(repo, "c.txt"), "Hello world\nhello-there\nshell\n");
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "hello.js"), "hello\n");
  const search = async (q: string, opts = "") => (await call("GET", `/api/projects/${project.id}/search?q=${encodeURIComponent(q)}${opts}`)).body;
  const hits = await search("hello");
  assert.deepEqual(hits.files, [
    { path: "c.txt", matches: [{ line: 1, column: 1, text: "Hello world" }, { line: 2, column: 1, text: "hello-there" }] },
    { path: "new.txt", matches: [{ line: 1, column: 1, text: "hello" }] },
  ]);
  assert.equal(hits.total, 3);
  assert.equal((await search("hello", "&case=1")).total, 2);
  assert.equal((await search("ell", "&word=1")).total, 0);
  assert.equal((await search("h.llo", "&regex=1")).total, 3);
  assert.equal((await search("h.llo")).total, 0);
  assert.equal((await call("GET", `/api/projects/${project.id}/search?q=${encodeURIComponent("(")}&regex=1`)).status, 400);
  assert.deepEqual(await search(""), { files: [], total: 0, truncated: false });

  // ステージ・ステージの取り消し・元に戻す（未追跡のファイルは消す）
  const post = (action: string, paths: string[]) => call("POST", `/api/projects/${project.id}/git/${action}`, { paths });
  const kinds = (list: { path: string; kind: string }[]) => list.map((f) => `${f.kind} ${f.path}`);
  let st = (await post("stage", ["a.txt", "c.txt"])).body;
  assert.ok(kinds(st.staged).includes("M a.txt") && kinds(st.staged).includes("A c.txt"));
  st = (await post("unstage", ["a.txt", "c.txt"])).body;
  assert.ok(!kinds(st.staged).includes("M a.txt") && kinds(st.unstaged).includes("U c.txt"));
  st = (await post("discard", ["a.txt", "c.txt"])).body;
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\n");
  assert.equal(fs.existsSync(path.join(repo, "c.txt")), false);
  assert.ok(!kinds(st.unstaged).some((k) => k.endsWith(" a.txt") || k.endsWith(" c.txt")));
  assert.equal((await post("discard", ["../outside.txt"])).status, 400);

  // コミット・プッシュ（プッシュ先は手元に作った空のリポジトリ）
  assert.equal((await call("POST", `/api/projects/${project.id}/git/commit`, { message: " " })).status, 400);
  await post("stage", ["b.txt"]);
  st = (await call("POST", `/api/projects/${project.id}/git/commit`, { message: "b を直す" })).body;
  assert.deepEqual(st.staged, []);
  assert.equal((await call("POST", `/api/projects/${project.id}/git/push`)).status, 400);
  const remote = tempDir();
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  git("remote", "add", "origin", remote);
  st = (await call("POST", `/api/projects/${project.id}/git/push`)).body;
  assert.equal(st.hasOrigin, true);
  assert.equal(st.upstream, "origin/main");
  assert.equal(st.ahead, 0);
  assert.match(execFileSync("git", ["log", "--oneline", "-1"], { cwd: remote }).toString(), /b を直す/);


  // 履歴: 新しい順。ブランチの印。コミットの詳細と、そのコミットでのファイルの差分
  const log = (await call("GET", `/api/projects/${project.id}/git/log`)).body;
  assert.deepEqual(log.commits.map((c: { subject: string }) => c.subject), ["b を直す", "init"]);
  assert.ok(log.commits[0].refs.includes("HEAD -> main"));
  assert.deepEqual(log.commits[1].parents, []);
  assert.equal(log.more, false);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/log?limit=1`)).body.more, true);
  const detail = (await call("GET", `/api/projects/${project.id}/git/commits/${log.commits[0].hash}`)).body;
  assert.deepEqual(detail.files, [{ path: "b.txt", kind: "M" }]);
  const first = (await call("GET", `/api/projects/${project.id}/git/commits/${log.commits[1].hash}`)).body;
  assert.deepEqual(first.files.map((f: { path: string }) => f.path), ["a.txt", "b.txt"]);
  const commitDiff = (await call("GET", `/api/projects/${project.id}/git/commits/${log.commits[0].hash}/diff?path=b.txt`)).body;
  assert.match(commitDiff.diff, /^\+bee!$/m);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/commits/zzz`)).status, 400);

  // ブランチ・リモート・タグ
  git("tag", "v1", log.commits[1].hash);
  const refs = (await call("GET", `/api/projects/${project.id}/git/refs`)).body;
  assert.deepEqual(refs.branches, [{ name: "main", hash: log.commits[0].hash, current: true, upstream: "origin/main", ahead: 0, behind: 0 }]);
  assert.deepEqual(refs.remotes, [{ name: "origin", branches: [{ name: "origin/main", hash: log.commits[0].hash }] }]);
  assert.deepEqual(refs.tags, [{ name: "v1", hash: log.commits[1].hash }]);
  assert.deepEqual(refs.stashes, []);

  // ワークツリー: 作る（リポジトリの隣のフォルダ）・一覧・変更があれば force でないと消せない
  const wtUrl = `/api/projects/${project.id}/git/worktrees`;
  assert.equal((await call("GET", wtUrl)).body.length, 1);
  assert.equal((await call("POST", wtUrl, { branch: "bad name" })).status, 400);
  const created = await call("POST", wtUrl, { branch: "feature/x" });
  assert.equal(created.status, 201);
  const wt = created.body.find((w: { branch: string }) => w.branch === "feature/x");
  assert.equal(wt.path, path.join(path.dirname(fs.realpathSync(repo)), `${path.basename(fs.realpathSync(repo))}-worktrees`, "feature-x"));
  assert.equal(created.body[0].main, true);
  fs.writeFileSync(path.join(wt.path, "wip.txt"), "wip\n");
  assert.equal((await call("POST", `${wtUrl}/remove`, { path: wt.path })).status, 400);
  assert.equal((await call("POST", `${wtUrl}/remove`, { path: created.body[0].path })).status, 400);
  const removed = (await call("POST", `${wtUrl}/remove`, { path: wt.path, force: true })).body;
  assert.equal(removed.length, 1);
  assert.equal(fs.existsSync(wt.path), false);
  fs.rmSync(path.dirname(wt.path), { recursive: true, force: true });

  // プル: ほかの手元から押されたコミットを、早送りで取り込む
  const other = tempDir();
  execFileSync("git", ["clone", "-q", remote, other]);
  fs.writeFileSync(path.join(other, "from-other.txt"), "x\n");
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "add", "."], { cwd: other });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "ほかから"], { cwd: other });
  execFileSync("git", ["push", "-q"], { cwd: other });
  // フェッチで、遅れている数がわかる
  assert.equal((await call("POST", `/api/projects/${project.id}/git/fetch`)).body.behind, 1);
  const pulled = await call("POST", `/api/projects/${project.id}/git/pull`);
  assert.equal(pulled.body.behind, 0);
  assert.equal(pulled.status, 200);
  assert.equal(fs.existsSync(path.join(repo, "from-other.txt")), true);
});

test("チャットの作業場所: 新しいワークツリーを作って、その中でエージェントを動かす。Git の操作も作業場所ごと", async () => {
  const { call, project, store, provider } = setup();
  const repo = project.repo_path;
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo });
  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");

  // 本体（指定なし）
  const main = (await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "本体で" })).body;
  assert.equal(main.worktree_path, "");
  await until(() => store.getRun(main.id)?.status === "completed");
  assert.equal(provider.lastCwd, repo);

  // 新しいワークツリー
  const created = await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "並行で", new_worktree_branch: "feat/a" });
  assert.equal(created.status, 201);
  const worktree = created.body.worktree_path;
  assert.ok(worktree.endsWith(path.join(`${path.basename(fs.realpathSync(repo))}-worktrees`, "feat-a")));
  await until(() => store.getRun(created.body.id)?.status === "completed");
  assert.equal(provider.lastCwd, worktree);

  // いまあるワークツリーを選ぶ・知らないフォルダは断る
  assert.equal((await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "同じ所", worktree_path: worktree })).body.worktree_path, worktree);
  assert.equal((await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "x", worktree_path: "/tmp" })).status, 400);

  // Git の操作は ?worktree= のワークツリーで行う
  fs.writeFileSync(path.join(worktree, "b.txt"), "b\n");
  const q = `?worktree=${encodeURIComponent(worktree)}`;
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status${q}`)).body.unstaged, [{ path: "b.txt", kind: "U" }]);
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status`)).body.unstaged, []);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/status?worktree=${encodeURIComponent("/tmp")}`)).status, 400);

  // 片付け: ワークツリーと手元のブランチを消す（本体は片付けられない）
  fs.rmSync(path.join(worktree, "b.txt"));
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/finish`, { path: repo })).status, 400);
  const finished = await call("POST", `/api/projects/${project.id}/git/worktrees/finish`, { path: worktree });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.length, 1);
  // そこで作業していたチャットは、本体に戻る。作業したブランチの名前は残す
  assert.equal(store.getRun(created.body.id)?.worktree_path, "");
  assert.equal(store.getRun(created.body.id)?.branch, "feat/a");
  assert.equal(store.getRun(main.id)?.branch, "main");
  // いまの作業を始めた時刻（作業中のチャットの経過時間に使う）
  assert.ok(store.getRun(main.id)?.turn_started_at);
  assert.equal(fs.existsSync(worktree), false);
  assert.equal(execFileSync("git", ["branch", "--list", "feat/a"], { cwd: repo }).toString().trim(), "");

  // エディタタブの履歴から消したときも、チャットは本体に戻る（ブランチの名前は残す）
  const other = (await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "別の作業", new_worktree_branch: "feat/b" })).body;
  await until(() => store.getRun(other.id)?.status === "completed");
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: other.worktree_path })).status, 200);
  assert.equal(store.getRun(other.id)?.worktree_path, "");
  assert.equal(store.getRun(other.id)?.branch, "feat/b");

  // アプリの外でフォルダを消したワークツリー: 続きを送ると分かる文で失敗し、片付けると Git の記録を消してチャットは本体に戻る
  const gone = (await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "消える所", new_worktree_branch: "feat/c" })).body;
  await until(() => store.getRun(gone.id)?.status === "completed");
  fs.rmSync(gone.worktree_path, { recursive: true, force: true });
  // フォルダが消えた作業場所の Git の操作は 404（「Git で管理されていません」と紛らわしく出さない）
  assert.equal((await call("GET", `/api/projects/${project.id}/git/status?worktree=${encodeURIComponent(gone.worktree_path)}`)).status, 404);
  assert.equal((await call("POST", `/api/runs/${gone.id}/messages`, { text: "続き" })).status, 200);
  await until(() => store.getRun(gone.id)?.status === "failed");
  assert.match(store.getRun(gone.id)?.error ?? "", /作業場所のフォルダが見つかりません/);
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/finish`, { path: gone.worktree_path })).status, 200);
  assert.equal(store.getRun(gone.id)?.worktree_path, "");
  assert.equal(store.getRun(gone.id)?.branch, "feat/c");
  fs.rmSync(path.dirname(worktree), { recursive: true, force: true });
});

test("サービスごとの使用状況: Claude と各サービスを並べ、失敗したサービスは error にしてほかは出す。取り直しは更新のときだけ", async () => {
  const { call, codexCalls } = setup();
  const first = await call("GET", "/api/usage/services");
  assert.equal(first.status, 200);
  assert.deepEqual(
    first.body.map((s: { id: string; status: string }) => [s.id, s.status]),
    [
      ["claude", "unavailable"],
      ["codex", "ok"],
      ["cursor", "error"],
    ],
  );
  assert.match(first.body[2].message, /つながりません/);
  // 5 分以内はとっておいた値を返す
  await call("GET", "/api/usage/services");
  assert.equal(codexCalls(), 1);
  const refreshed = await call("POST", "/api/usage/services/refresh");
  assert.equal(refreshed.status, 200);
  assert.equal(codexCalls(), 2);
});

test("チャット欄の / のコマンド: プロジェクトの作業場所で調べる。プロジェクトがなければ 404", async () => {
  const { call, project, provider } = setup();
  provider.commandList = [{ name: "review", description: "コードを見直す", argumentHint: "" }];
  const res = await call("GET", `/api/projects/${project.id}/commands`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, provider.commandList);
  assert.equal(provider.lastCommandsCwd, project.repo_path);
  assert.equal((await call("GET", "/api/projects/999/commands")).status, 404);
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

test("自動のアーカイブ: 完了して日数がたったチャットだけをアーカイブする（確認待ち・固定はしない）。設定で日数を選ぶ", async () => {
  const { call, project, store } = setup();
  const finish = async (prompt: string) => {
    const run = (await call("POST", `/api/projects/${project.id}/runs`, { phase: "requirements", prompt })).body;
    await until(() => store.getRun(run.id)?.status === "completed");
    return run.id as number;
  };
  const done = await finish("終わったもの");
  const pinned = await finish("固定したもの");
  const unread = await finish("まだ見ていないもの");
  store.setRunAttention(done, false);
  store.setRunAttention(pinned, false);
  store.setRunPinned(pinned, true);
  store.setRunAttention(unread, true);

  // まだ日数がたっていなければ、何もしない
  assert.equal(store.archiveStaleRuns(7), 0);
  // 8 日後: 完了して確認済みのものだけ
  assert.equal(store.archiveStaleRuns(7, new Date(Date.now() + 8 * 86_400_000)), 1);
  assert.ok(store.getRun(done)?.archived_at);
  assert.equal(store.getRun(pinned)?.archived_at, null);
  assert.equal(store.getRun(unread)?.archived_at, null);

  // 設定（初めはしない。1〜365 日）
  assert.equal((await call("GET", "/api/settings")).body.autoArchiveDays, null);
  assert.equal((await call("PUT", "/api/settings", { autoArchiveDays: 0 })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { autoArchiveDays: 7 })).body.autoArchiveDays, 7);
  assert.equal((await call("PUT", "/api/settings", { autoArchiveDays: null })).body.autoArchiveDays, null);
});
