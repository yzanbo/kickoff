import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalCenter } from "./approvals.js";
import { Bus } from "./bus.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult } from "./providers/types.js";
import { Runner } from "./runner.js";
import { Store } from "./store.js";
import type { ProviderId } from "./types.js";
import type { UsageMonitor } from "./usage.js";

type Script = (params: ProviderRunParams, cb: ProviderCallbacks, signal: AbortSignal) => Promise<ProviderRunResult>;

/** 台本どおりに振る舞う偽のプロバイダー */
class FakeProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Fake";
  readonly implemented = true;
  calls: ProviderRunParams[] = [];
  constructor(private script: Script) {}
  async status() {
    return { id: this.id, label: this.label, implemented: true, installed: true, loggedIn: true, detail: "" };
  }
  run(params: ProviderRunParams, cb: ProviderCallbacks, signal: AbortSignal) {
    this.calls.push(params);
    return this.script(params, cb, signal);
  }
}

function setup(script: Script) {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const provider = new FakeProvider(script);
  const usage = { refresh: async () => ({}) } as unknown as UsageMonitor;
  const runner = new Runner({ store, approvals, providers: { claude: provider, codex: provider } as Record<ProviderId, AgentProvider>, usage });
  const project = store.createProject({ name: "p", repo_path: "/tmp", provider: "claude" });
  return { store, approvals, runner, provider, project };
}

const tick = () => new Promise((r) => setTimeout(r, 10));
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}

test("実行するとイベントが記録され、続きのメッセージは同じセッションで再開する", async () => {
  const { store, runner, provider, project } = setup(async (params, cb) => {
    cb.emit({ type: "init", session_id: "s1" });
    cb.emit({ type: "text", text: `受け取りました: ${params.prompt}` });
    return { status: "completed", sessionId: "s1", result: "ok", costUsd: 0.01, turns: 1 };
  });

  const run = runner.start({ projectId: project.id, phase: "requirements", prompt: "こんにちは", options: { model: "sonnet", effort: "low" } });
  await until(() => store.getRun(run.id)?.status === "completed");
  assert.equal(store.getRun(run.id)?.session_id, "s1");
  assert.equal(provider.calls[0].model, "sonnet");
  assert.equal(provider.calls[0].effort, "low");
  // チャット欄の指定はそのチャットだけに効き、設定の既定は変わらない
  assert.equal(store.getSettings().claudeModel, "opus");

  runner.send(run.id, "続き", { permission_mode: "plan" });
  await until(() => store.getRun(run.id)?.num_turns === 2);
  assert.equal(provider.calls[1].resumeSessionId, "s1");
  assert.equal(provider.calls[1].permissionMode, "plan");
  assert.deepEqual(
    store.listEvents(run.id).map((e) => e.type),
    ["user", "init", "text", "result", "user", "init", "text", "result"],
  );
});

test("チャット欄で指定がなければ設定の既定（モデル・深さ・権限・ファストモード）を使う", async () => {
  const { store, runner, provider, project } = setup(async () => ({ status: "completed", sessionId: "s" }));
  store.updateSettings({ claudeModel: "fable", defaultEffort: "high", defaultPermission: "auto", defaultFastMode: true });
  const run = runner.start({ projectId: project.id, phase: "requirements", prompt: "x" });
  await until(() => store.getRun(run.id)?.status === "completed");
  const call = provider.calls[0];
  assert.deepEqual([call.model, call.effort, call.permissionMode, call.fastMode], ["fable", "high", "auto", true]);
});

test("承認待ちの間は waiting になり、回答するとエージェントに結果が渡る", async () => {
  let received: unknown;
  const { store, runner, approvals, project } = setup(async (_p, cb, signal) => {
    received = await cb.requestApproval({ kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false }, signal);
    return { status: "completed", sessionId: "s" };
  });

  const run = runner.start({ projectId: project.id, phase: "requirements", prompt: "q" });
  await until(() => store.getRun(run.id)?.status === "waiting");
  const [pending] = approvals.list({ runId: run.id });
  assert.ok(approvals.resolve(pending.id, { action: "answer", answers: { 何を作る: "Todo" } }));
  await until(() => store.getRun(run.id)?.status === "completed");
  assert.deepEqual(received, { action: "answer", answers: { 何を作る: "Todo" } });
  assert.equal(approvals.list().length, 0);
});

test("同時実行数の上限を超えた分は待機し、中断すると承認待ちも片付く", async () => {
  const { store, runner, approvals, project } = setup(async (_p, cb, signal) => {
    const d = await cb.requestApproval({ kind: "permission", toolName: "Bash", input: { command: "ls" }, canRemember: false }, signal);
    return signal.aborted ? { status: "cancelled", sessionId: null } : { status: d.action === "deny" ? "failed" : "completed", sessionId: null };
  });
  store.updateSettings({ maxConcurrentRuns: 1 });

  const a = runner.start({ projectId: project.id, phase: "requirements", prompt: "a" });
  const b = runner.start({ projectId: project.id, phase: "requirements", prompt: "b" });
  await until(() => store.getRun(a.id)?.status === "waiting");
  assert.equal(store.getRun(b.id)?.status, "queued");

  runner.cancel(a.id);
  await until(() => store.getRun(a.id)?.status === "cancelled");
  await until(() => store.getRun(b.id)?.status === "waiting");
  assert.deepEqual(
    approvals.list().map((x) => x.run_id),
    [b.id],
  );
  runner.cancel(b.id);
  await until(() => store.getRun(b.id)?.status === "cancelled");
});

test("タスクの実行で AI が状態を更新しなかった場合、成功ならレビュー待ちにする", async () => {
  const { store, runner, project } = setup(async () => ({ status: "completed", sessionId: null }));
  const task = store.createTask({ project_id: project.id, phase: "implementation", title: "t" });
  runner.start({ projectId: project.id, phase: "implementation", taskId: task.id, prompt: "go" });
  await until(() => store.getTask(task.id)?.status === "review");
});
