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
  // 発言には、Claude Code に渡した ID も残す（ファイルを戻すときの目印）
  const { message_uuid, ...data } = store.listEvents(run.id)[0].data as { message_uuid?: string };
  assert.deepEqual(data, { text: "読んで", attachments: [attachment] });
  assert.equal(message_uuid, provider.calls[0].promptId);
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

test("作業が終わると未読になり、続けて送ると消える。中断では付かない", async () => {
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

  // 中断したときは未読を付けない
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
  // 何と答えたかを記録に残す（画面は「質問への回答」の吹き出しで出す）
  const resolved = store.listEvents(run.id).find((e) => e.type === "approval_resolved");
  assert.deepEqual(resolved?.data, { approval_id: pending.id, action: "answer", kind: "question", answers: { 何を作る: "Todo" } });
});

test("質問の「その他」に添付して答えたら、記録には選んだままの回答と添付を残す（AI には添付のパスを書き添えた回答を渡す）", async () => {
  let received: unknown;
  const { store, runner, approvals, project } = setup(async (_p, cb, signal) => {
    received = await cb.requestApproval({ kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false }, signal);
    return { status: "completed", sessionId: "s" };
  });
  const run = await runner.start({ projectId: project.id, prompt: "q" });
  await until(() => store.getRun(run.id)?.status === "waiting");
  const [pending] = approvals.list({ runId: run.id });
  const attachment = { id: "a1", name: "色.png", mime: "image/png", size: 10 };
  approvals.resolve(pending.id, { action: "answer", answers: { 好きな色: "この色（/path/色.png）" }, plain: { 好きな色: "この色" }, attachments: { 好きな色: [attachment] } });
  await until(() => store.getRun(run.id)?.status === "completed");
  assert.deepEqual((received as { answers: unknown }).answers, { 好きな色: "この色（/path/色.png）" });
  const resolved = store.listEvents(run.id).find((e) => e.type === "approval_resolved");
  assert.deepEqual(resolved?.data, {
    approval_id: pending.id,
    action: "answer",
    kind: "question",
    answers: { 好きな色: "この色" },
    attachments: { 好きな色: [attachment] },
  });
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

test("手で圧縮すると /compact を送り、要約したことだけを残す（発言・未読・会話の回数には数えない）", async () => {
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

/** 外から終わらせるまで作業中のままの台本（止められたら cancelled） */
function gatedScript() {
  const gates: (() => void)[] = [];
  const script: Script = (params, _cb, signal) =>
    new Promise((resolve) => {
      gates.push(() => resolve({ status: "completed", sessionId: "s", turns: 1, result: params.prompt }));
      signal.addEventListener("abort", () => resolve({ status: "cancelled", sessionId: "s" }), { once: true });
    });
  return { gates, script };
}

test("待ちの列: 作業中に送った指示は列に入り、終わったら順に送る", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project, bus } = setup(script);
  const published: number[] = [];
  bus.subscribe((e) => e.type === "run_queue" && published.push(e.queue.length));
  const run = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  assert.equal((await runner.queueMessage(run.id, "2")).queued, true);
  await runner.queueMessage(run.id, "3");
  assert.deepEqual(runner.queued(run.id).map((m) => m.text), ["2", "3"]);
  // 並べ替え: 3 を先頭に
  assert.equal(runner.moveQueued(run.id, runner.queued(run.id)[1].id, 0), true);
  gates[0]();
  await until(() => gates.length === 2);
  assert.equal(provider.calls[1].prompt, "3");
  assert.deepEqual(runner.queued(run.id).map((m) => m.text), ["2"]);
  gates[1]();
  await until(() => gates.length === 3);
  gates[2]();
  await until(() => store.getRun(run.id)?.status === "completed" && runner.queued(run.id).length === 0);
  assert.deepEqual(provider.calls.map((c) => c.prompt), ["1", "3", "2"]);
  assert.deepEqual(published, [1, 2, 2, 1, 0]);
  // 作業中でなければすぐ送る
  assert.deepEqual(await runner.queueMessage(run.id, "4"), { queued: false });
  await until(() => gates.length === 4);
  gates[3]();
});

test("待ちの列: 止めた・失敗したときも次を送り、「すぐ送る」は作業を止めない（伝えられなければ列の先頭に移す）", async () => {
  const { gates, script } = gatedScript();
  const { store, runner, provider, project } = setup(script);
  const run = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.queueMessage(run.id, "2");
  // 止めても、待ちの次の指示を送る
  runner.cancel(run.id);
  await until(() => gates.length === 2);
  assert.deepEqual(runner.queued(run.id), []);
  // 作業中に「すぐ送る」→ 止めずに伝える。この偽のプロバイダーは発言を足せないので、列の先頭に移す（作業は止めない）
  await runner.queueMessage(run.id, "3");
  await runner.queueMessage(run.id, "4");
  assert.equal(await runner.sendQueuedNow(run.id, runner.queued(run.id)[1].id), true);
  assert.deepEqual(runner.queued(run.id).map((m) => m.text), ["4", "3"]);
  assert.equal(gates.length, 2);
  assert.equal(runner.removeQueued(run.id, runner.queued(run.id)[1].id), true);
  assert.equal(runner.removeQueued(run.id, "nope"), false);
  assert.equal(await runner.sendQueuedNow(run.id, "nope"), false);
  // 終わったら、先頭に移した指示を送る
  gates[1]();
  await until(() => gates.length === 3);
  assert.deepEqual(provider.calls.map((c) => c.prompt), ["1", "2", "4"]);
  gates[2]();
  await until(() => store.getRun(run.id)?.status === "completed");
});

test("待ちの列: アプリを終えるときは送らない", async () => {
  const { gates, script } = gatedScript();
  const { runner, provider, project } = setup(script);
  const run = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => gates.length === 1);
  await runner.queueMessage(run.id, "2");
  runner.shutdown();
  await until(() => !runner.isBusy(run.id));
  await tick();
  assert.equal(provider.calls.length, 1);
});

test("送信待ちを送っている途中に「いま」で送っても、同じチャットを 2 つ同時に動かさず、どちらの指示も渡る", async () => {
  let running = 0;
  let maxRunning = 0;
  const { store, runner, provider, project } = setup(async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await tick();
    running--;
    return { status: "completed", sessionId: "s1" };
  });
  const run = await runner.start({ projectId: project.id, prompt: "最初" });
  await until(() => store.getRun(run.id)?.status === "completed");
  // 送信待ちの次の指示を送っている（送る準備の途中）ところへ、「いま」で送る
  const results = await Promise.allSettled([runner.send(run.id, "送信待ちの指示"), runner.tell(run.id, "いまの指示")]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "fulfilled"],
  );
  await until(() => !runner.isBusy(run.id) && provider.calls.length === 3);
  assert.equal(maxRunning, 1);
  // どちらの指示も、別々の実行として Claude Code に渡っている
  assert.match(provider.calls[1].prompt, /送信待ちの指示/);
  assert.match(provider.calls[2].prompt, /いまの指示/);
  assert.deepEqual(
    store
      .listEvents(run.id)
      .filter((e) => e.type === "user")
      .map((e) => (e.data as { text: string }).text),
    ["最初", "送信待ちの指示", "いまの指示"],
  );
});

test("作業が終わるのと同時に「いま」で送って待ちの列に入ったときも、取り残さずに送る", async () => {
  let release: (() => void) | undefined;
  let calls = 0;
  const { store, runner, provider, project } = setup(async (_p, cb) => {
    if (++calls > 1) return { status: "completed", sessionId: "s1" };
    // 作業中に足せる口はあるが、返答を書き終えて閉じている（足せない）
    cb.control?.({ tell: () => false, stopTask: async () => {} });
    await new Promise<void>((r) => (release = r));
    cb.control?.(null);
    return { status: "completed", sessionId: "s1" };
  });
  const run = await runner.start({ projectId: project.id, prompt: "最初" });
  await until(() => runner.isBusy(run.id) && release !== undefined);
  const told = runner.tell(run.id, "いまの指示");
  // 指示を組み立てている間に作業が終わる
  release!();
  assert.equal(await told, "queued");
  await until(() => provider.calls.length === 2 && !runner.isBusy(run.id));
  assert.match(provider.calls[1].prompt, /いまの指示/);
  assert.equal(store.getRun(run.id)?.status, "completed");
});
