import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ApprovalCenter } from "./approvals.js";
import { Bus } from "./bus.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult } from "./providers/types.js";
import { Runner } from "./runner.js";
import { Store } from "./store.js";
import { FakeProviderBase } from "./testing/fakeProvider.js";
import type { ProviderId } from "./types.js";
import { UploadStore } from "./uploads.js";
import type { UsageMonitor } from "./usage.js";

type Script = (params: ProviderRunParams, cb: ProviderCallbacks, signal: AbortSignal) => Promise<ProviderRunResult>;

/** 台本どおりに振る舞う偽のプロバイダー */
class FakeProvider extends FakeProviderBase {
  calls: ProviderRunParams[] = [];
  constructor(private script: Script) {
    super();
  }
  run(params: ProviderRunParams, cb: ProviderCallbacks, signal: AbortSignal) {
    this.calls.push(params);
    return this.script(params, cb, signal);
  }
}

function setup(script: Script, uploads?: UploadStore) {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const provider = new FakeProvider(script);
  const usage = { refresh: async () => ({}) } as unknown as UsageMonitor;
  const runner = new Runner({
    store,
    approvals,
    providers: { claude: provider, codex: provider, gemini: provider } as Record<ProviderId, AgentProvider>,
    usage,
    uploads,
    bus,
  });
  const project = store.createProject({ name: "p", repo_path: "/tmp", provider: "claude" });
  return { store, approvals, runner, provider, project, bus };
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

  const run = await runner.start({ projectId: project.id, prompt: "こんにちは", options: { model: "sonnet", effort: "low" } });
  await until(() => store.getRun(run.id)?.status === "completed");
  assert.equal(store.getRun(run.id)?.session_id, "s1");
  assert.equal(provider.calls[0].model, "sonnet");
  assert.equal(provider.calls[0].effort, "low");
  // チャット欄の指定はそのチャットだけに効き、設定の既定は変わらない
  assert.equal(store.getSettings().claudeModel, "opus");

  await runner.send(run.id, "続き", { permission_mode: "plan" });
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
  const run = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.getRun(run.id)?.status === "completed");
  const call = provider.calls[0];
  assert.deepEqual([call.model, call.effort, call.permissionMode, call.fastMode], ["fable", "high", "auto", true]);
});

test("どこでも決めていなければ、推論の深さは指定せず（null）、権限モードは毎回確認。指示と権限はどのチャットも同じ", async () => {
  const { store, runner, provider, project } = setup(async () => ({ status: "completed", sessionId: "s" }));
  const run = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.getRun(run.id)?.status === "completed");
  const call = provider.calls[0];
  assert.deepEqual([call.effort, call.permissionMode], [null, "default"]);
  assert.deepEqual([store.getRun(run.id)?.effort, store.getRun(run.id)?.permission_mode], [null, "default"]);
  assert.ok(call.policy.allowedCommands.includes("git status"));
  assert.ok(!call.systemPrompt.includes("mcp__kickoff__"));
});

test("添付ファイルはパスがメッセージに書き添えられ、会話には添付として記録される", async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-run-up-"));
  const uploads = new UploadStore(uploadsDir);
  const { store, runner, provider, project } = setup(async () => ({ status: "completed", sessionId: "s" }), uploads);
  const attachment = await uploads.save({ name: "spec.md", type: "text/markdown", bytes: new TextEncoder().encode("# 仕様") });
  const run = await runner.start({ projectId: project.id, prompt: "読んで", attachments: [attachment] });
  await until(() => store.getRun(run.id)?.status === "completed");
  assert.match(provider.calls[0].prompt, /spec\.md（text\/markdown/);
  assert.deepEqual(provider.calls[0].additionalDirectories, [uploadsDir]);
  assert.deepEqual(store.listEvents(run.id)[0].data, { text: "読んで", attachments: [attachment] });
});

test("返答の途中経過は配信だけされ、チャット名は AI が付ける（ユーザーが変えていなければ）", async () => {
  const { store, runner, provider, project, bus } = setup(async (_p, cb) => {
    cb.stream?.("こん");
    cb.stream?.("にちは");
    cb.emit({ type: "text", text: "こんにちは" });
    return { status: "completed", sessionId: "s" };
  });
  (provider as unknown as { title: (t: string) => Promise<string> }).title = async () => "挨拶";
  const deltas: string[] = [];
  bus.subscribe((e) => e.type === "run_delta" && deltas.push(e.text));

  const run = await runner.start({ projectId: project.id, prompt: "とても長い依頼文" });
  await until(() => store.getRun(run.id)?.status === "completed" && store.getRun(run.id)?.title === "挨拶");
  assert.deepEqual(deltas, ["こん", "にちは"]);
  // 途中経過は保存しない
  assert.deepEqual(
    store.listEvents(run.id).map((e) => e.type),
    ["user", "text", "result"],
  );
});

test("作業が終わると確認待ちになり、続けて送ると消える。中断では付かない", async () => {
  // 2 回目の実行は、合図があるまで終わらせない
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const { store, runner, project } = setup(async (_p, _cb, signal) => {
    calls++;
    if (calls === 2) await gate;
    if (calls === 3) await new Promise<void>((r) => signal.addEventListener("abort", () => r()));
    return { status: signal.aborted ? "cancelled" : "completed", sessionId: "s" };
  });
  const run = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.getRun(run.id)?.status === "completed");
  assert.equal(store.getRun(run.id)?.attention, true);

  await runner.send(run.id, "続き");
  assert.equal(store.getRun(run.id)?.attention, false);
  release();
  await until(() => store.getRun(run.id)?.status === "completed" && store.getRun(run.id)?.attention === true);

  // 中断したときは確認待ちを付けない
  store.updateRun(run.id, { attention: false });
  await runner.send(run.id, "もう一度");
  await until(() => store.getRun(run.id)?.status === "running");
  runner.cancel(run.id);
  await until(() => store.getRun(run.id)?.status === "cancelled");
  assert.equal(store.getRun(run.id)?.attention, false);
});

test("承認待ちの間は waiting になり、回答するとエージェントに結果が渡る", async () => {
  let received: unknown;
  const { store, runner, approvals, project } = setup(async (_p, cb, signal) => {
    received = await cb.requestApproval({ kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false }, signal);
    return { status: "completed", sessionId: "s" };
  });

  const run = await runner.start({ projectId: project.id, prompt: "q" });
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

  const a = await runner.start({ projectId: project.id, prompt: "a" });
  const b = await runner.start({ projectId: project.id, prompt: "b" });
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

test("同時実行数が上限なし（null）なら、順番待ちをせずにすべて動かす", async () => {
  const { store, runner, project } = setup(async (_p, cb, signal) => {
    const d = await cb.requestApproval({ kind: "permission", toolName: "Bash", input: { command: "ls" }, canRemember: false }, signal);
    return signal.aborted ? { status: "cancelled", sessionId: null } : { status: d.action === "deny" ? "failed" : "completed", sessionId: null };
  });
  store.updateSettings({ maxConcurrentRuns: null });

  const runs = await Promise.all(["a", "b", "c"].map((prompt) => runner.start({ projectId: project.id, prompt })));
  await until(() => runs.every((r) => store.getRun(r.id)?.status === "waiting"));
  for (const r of runs) runner.cancel(r.id);
  await until(() => runs.every((r) => store.getRun(r.id)?.status === "cancelled"));
});

test("手で圧縮すると /compact を送り、要約したことだけを残す（発言・確認待ち・会話の回数には数えない）", async () => {
  const { store, runner, provider, project } = setup(async (params, cb) => {
    if (params.prompt === "/compact") {
      cb.emit({ type: "compact", trigger: "manual", pre_tokens: 120_000, post_tokens: 18_000 });
      // 本物のプロバイダーは、要約のあとの大きさ（post_tokens）を結果のコンテキストとして返す
      return { status: "completed", sessionId: "s1", result: "", turns: 1, context: { tokens: 18_000, window: 200_000 } };
    }
    cb.emit({ type: "init", session_id: "s1" });
    cb.emit({ type: "text", text: "ok" });
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1, context: { tokens: 120_000, window: 200_000 } };
  });

  // まだ会話がないチャットは圧縮できない
  const fresh = store.createRun({ project_id: project.id, provider: "claude", title: "t", status: "completed", model: null });
  await assert.rejects(runner.compact(fresh.id), /まだ会話がない/);

  const run = await runner.start({ projectId: project.id, prompt: "こんにちは" });
  await until(() => store.getRun(run.id)?.status === "completed");
  store.setRunAttention(run.id, false);
  const before = store.getRun(run.id)!;
  const eventsBefore = store.listEvents(run.id).length;

  await runner.compact(run.id);
  await until(() => !runner.isBusy(run.id) && store.getRun(run.id)?.status === "completed");
  const after = store.getRun(run.id)!;
  assert.equal(provider.calls.at(-1)?.prompt, "/compact");
  assert.equal(provider.calls.at(-1)?.resumeSessionId, "s1");
  const added = store.listEvents(run.id).slice(eventsBefore);
  assert.deepEqual(
    added.map((e) => e.type),
    ["compact"],
  );
  assert.equal(after.attention, false);
  assert.equal(after.num_turns, before.num_turns);
  assert.equal(after.result, before.result);
  assert.equal(after.context_tokens, 18_000);
});
