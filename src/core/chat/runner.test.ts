// 実行の受付（Runner）のテスト: 送る・続き・既定の選択・添付・途中経過・未読・止める・承認・圧縮。送信待ちの列は runner.queue.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ScriptedProvider, type Script } from "../testing/fakeProvider.js";
import { tempDir } from "../testing/tempDir.js";
import { setupCore, until } from "../testing/testCore.js";
import { UploadStore } from "./uploads.js";
import type { CompactingState } from "@shared/types";

/** 台本どおりの偽のプロバイダーで、コアを組み立てる（API のテストと同じ準備。testing/testCore.ts） */
const setup = (script: Script, uploads?: UploadStore) => setupCore(new ScriptedProvider(script), { uploads });

test("実行するとイベントが記録され、続きのメッセージは同じセッションで再開する", async () => {
  const { store, runner, provider, project } = setup(async (params, cb) => {
    cb.emit({ type: "init", session_id: "s1" });
    cb.emit({ type: "text", text: `受け取りました: ${params.prompt}` });
    return { status: "completed", sessionId: "s1", result: "ok", costUsd: 0.01, turns: 1 };
  });

  const chat = await runner.start({ projectId: project.id, prompt: "こんにちは", options: { model: "sonnet", effort: "low" } });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.equal(store.chats.get(chat.id)?.session_id, "s1");
  assert.equal(provider.calls[0].model, "sonnet");
  assert.equal(provider.calls[0].effort, "low");
  // チャット欄の指定はそのチャットだけに効き、設定の既定は変わらない
  assert.equal(store.settings.get().chat_defaults.model, "opus");

  await runner.send(chat.id, "続き", { permission_mode: "plan" });
  await until(() => store.chats.get(chat.id)?.num_turns === 2);
  assert.equal(provider.calls[1].resumeSessionId, "s1");
  assert.equal(provider.calls[1].permissionMode, "plan");
  assert.deepEqual(
    store.events.list(chat.id).map((e) => e.type),
    ["user", "init", "text", "result", "user", "init", "text", "result"],
  );
});

test("チャット欄で指定がなければ設定の既定（モデル・深さ・権限・ファストモード）を使う", async () => {
  const { store, runner, provider, project } = setup(async () => ({ status: "completed", sessionId: "s" }));
  store.settings.update({ chat_defaults: { model: "fable", effort: "high", permission_mode: "auto", fast_mode: true } });
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  const call = provider.calls[0];
  assert.deepEqual([call.model, call.effort, call.permissionMode, call.fastMode], ["fable", "high", "auto", true]);
});

test("自動圧縮を始める使用率は設定の値を渡す（決めていなければ null）", async () => {
  const { store, runner, provider, project } = setup(async () => ({ status: "completed", sessionId: "s" }));
  const first = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(first.id)?.status === "completed");
  store.settings.update({ auto_compact_pct: 50 });
  const second = await runner.start({ projectId: project.id, prompt: "y" });
  await until(() => store.chats.get(second.id)?.status === "completed");
  assert.deepEqual(provider.calls.map((c) => c.autoCompactPct), [null, 50]);
});

test("どこでも決めていなければ、推論の深さは指定せず（null）、権限モードは毎回確認。指示と権限はどのチャットも同じ", async () => {
  const { store, runner, provider, project } = setup(async () => ({ status: "completed", sessionId: "s" }));
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  const call = provider.calls[0];
  assert.deepEqual([call.effort, call.permissionMode], [null, "default"]);
  assert.deepEqual([store.chats.get(chat.id)?.effort, store.chats.get(chat.id)?.permission_mode], [null, "default"]);
  assert.ok(call.policy.allowedCommands.includes("git status"));
  assert.ok(!call.systemPrompt.includes("mcp__kickoff__"));
});

test("添付ファイルはパスがメッセージに書き添えられ、会話には添付として記録される", async () => {
  const uploadsDir = tempDir();
  const uploads = new UploadStore(uploadsDir);
  const { store, runner, provider, project } = setup(async () => ({ status: "completed", sessionId: "s" }), uploads);
  const attachment = await uploads.save({ name: "spec.md", type: "text/markdown", bytes: new TextEncoder().encode("# 仕様") });
  const chat = await runner.start({ projectId: project.id, prompt: "読んで", attachments: [attachment] });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.match(provider.calls[0].prompt, /spec\.md（text\/markdown/);
  assert.deepEqual(provider.calls[0].additionalDirectories, [uploadsDir]);
  // 発言には、Claude Code に渡した ID も残す（ファイルを戻すときの目印）
  const { message_uuid, ...data } = store.events.list(chat.id)[0].data as { message_uuid?: string };
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
  bus.subscribe((e) => e.type === "chat_delta" && deltas.push(e.text));

  const chat = await runner.start({ projectId: project.id, prompt: "とても長い依頼文" });
  await until(() => store.chats.get(chat.id)?.status === "completed" && store.chats.get(chat.id)?.title === "挨拶");
  assert.deepEqual(deltas, ["こん", "にちは"]);
  // 途中経過は保存しない
  assert.deepEqual(
    store.events.list(chat.id).map((e) => e.type),
    ["user", "text", "result"],
  );
});

test("実行中のコマンドの出力は、チャットとプロジェクトを添えて配信だけされ、保存しない", async () => {
  const { store, runner, project, bus } = setup(async (_p, cb) => {
    cb.commandOutput?.({ tool_use_id: "tu1", task_id: "b1", text: "line1" });
    cb.commandOutput?.({ tool_use_id: "tu1", task_id: "b1", text: "line1\nline2" });
    return { status: "completed", sessionId: "s" };
  });
  const outputs: { chat_id: number; project_id: number; text: string }[] = [];
  bus.subscribe((e) => e.type === "chat_command_output" && outputs.push({ chat_id: e.chat_id, project_id: e.project_id, text: e.output.text }));

  const chat = await runner.start({ projectId: project.id, prompt: "ビルドして" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.deepEqual(outputs, [
    { chat_id: chat.id, project_id: project.id, text: "line1" },
    { chat_id: chat.id, project_id: project.id, text: "line1\nline2" },
  ]);
  assert.deepEqual(
    store.events.list(chat.id).map((e) => e.type),
    ["user", "result"],
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
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.equal(store.chats.get(chat.id)?.unread, true);

  await runner.send(chat.id, "続き");
  assert.equal(store.chats.get(chat.id)?.unread, false);
  release();
  await until(() => store.chats.get(chat.id)?.status === "completed" && store.chats.get(chat.id)?.unread === true);

  // 中断したときは未読を付けない
  store.chats.update(chat.id, { unread: false });
  await runner.send(chat.id, "もう一度");
  await until(() => store.chats.get(chat.id)?.status === "running");
  runner.cancel(chat.id);
  await until(() => store.chats.get(chat.id)?.status === "cancelled");
  assert.equal(store.chats.get(chat.id)?.unread, false);
});

test("送った直後（作業場所を調べている間）に止めても、プロバイダーを動かさずに中断で終わる", async () => {
  let calls = 0;
  const { store, runner, project } = setup(async (_p, _cb, signal) => {
    calls++;
    await new Promise<void>((r) => signal.addEventListener("abort", () => r()));
    return { status: "cancelled", sessionId: null };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  runner.cancel(chat.id);
  await until(() => store.chats.get(chat.id)?.status === "cancelled");
  assert.equal(calls, 0);
  assert.equal(runner.isBusy(chat.id), false);
});

test("承認待ちの間は作業中のまま回答待ちの一覧に入り、回答するとエージェントに結果が渡る", async () => {
  let received: unknown;
  const { store, runner, approvals, project } = setup(async (_p, cb, signal) => {
    received = await cb.requestApproval({ kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false }, signal);
    return { status: "completed", sessionId: "s" };
  });

  const chat = await runner.start({ projectId: project.id, prompt: "q" });
  await until(() => approvals.list({ chatId: chat.id }).length === 1);
  assert.equal(store.chats.get(chat.id)?.status, "running");
  const [pending] = approvals.list({ chatId: chat.id });
  approvals.resolve(pending.id, { action: "answer", answers: { 何を作る: "Todo" } });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.deepEqual(received, { action: "answer", answers: { 何を作る: "Todo" } });
  assert.equal(approvals.list().length, 0);
  // 何と答えたかを記録に残す（画面は「質問への回答」の吹き出しで出す）
  const resolved = store.events.list(chat.id).find((e) => e.type === "approval_resolved");
  assert.deepEqual(resolved?.data, { approval_id: pending.id, action: "answer", kind: "question", answers: { 何を作る: "Todo" } });
});

test("質問の「その他」に添付して答えたら、記録には選んだままの回答と添付を残す（AI には添付のパスを書き添えた回答を渡す）", async () => {
  let received: unknown;
  const { store, runner, approvals, project } = setup(async (_p, cb, signal) => {
    received = await cb.requestApproval({ kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false }, signal);
    return { status: "completed", sessionId: "s" };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "q" });
  await until(() => approvals.list({ chatId: chat.id }).length === 1);
  const [pending] = approvals.list({ chatId: chat.id });
  const attachment = { id: "a1", name: "色.png", mime: "image/png", size: 10 };
  approvals.resolve(pending.id, { action: "answer", answers: { 好きな色: "この色（/path/色.png）" }, plain: { 好きな色: "この色" }, attachments: { 好きな色: [attachment] } });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.deepEqual((received as { answers: unknown }).answers, { 好きな色: "この色（/path/色.png）" });
  const resolved = store.events.list(chat.id).find((e) => e.type === "approval_resolved");
  assert.deepEqual(resolved?.data, {
    approval_id: pending.id,
    action: "answer",
    kind: "question",
    answers: { 好きな色: "この色" },
    attachments: { 好きな色: [attachment] },
  });
});

test("送った指示は数に関係なくすぐ動き、中断すると承認待ちも片付く", async () => {
  const { runner, approvals, project, store } = setup(async (_p, cb, signal) => {
    const d = await cb.requestApproval({ kind: "permission", toolName: "Bash", input: { command: "ls" }, canRemember: false }, signal);
    return signal.aborted ? { status: "cancelled", sessionId: null } : { status: d.action === "deny" ? "failed" : "completed", sessionId: null };
  });

  const chats = await Promise.all(["a", "b", "c"].map((prompt) => runner.start({ projectId: project.id, prompt })));
  await until(() => chats.every((r) => approvals.list({ chatId: r.id }).length === 1));
  assert.equal(runner.stats().running, 3);

  runner.cancel(chats[0].id);
  await until(() => store.chats.get(chats[0].id)?.status === "cancelled");
  assert.deepEqual(
    approvals.list().map((x) => x.chat_id).sort(),
    [chats[1].id, chats[2].id].sort(),
  );
  for (const r of chats.slice(1)) runner.cancel(r.id);
  await until(() => chats.every((r) => store.chats.get(r.id)?.status === "cancelled"));
});

test("圧縮のきっかけ: 手で圧縮した（ボタン・/compact を送った）ときは manual、ほかの指示の途中の圧縮は auto。失敗は手で圧縮したときだけお知らせに残す", async () => {
  const seen: [string, CompactingState | null][] = [];
  let chatId = 0;
  const { store, runner, project } = setup(async (params, cb) => {
    // 作ったチャットの ID を受け取ってから動く（runner.live で様子を読むため）
    await until(() => chatId !== 0);
    cb.emit({ type: "init", session_id: "s1" });
    cb.compacting?.(true);
    seen.push([params.prompt, runner.live(chatId).compacting]);
    // 要約するものがないなど、圧縮が失敗して終わる
    cb.compacting?.(false);
    cb.compactFailed?.(params.prompt.startsWith("/compact") ? "too long" : "too_few_groups");
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1 };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "続けて" });
  chatId = chat.id;
  await until(() => store.chats.get(chat.id)?.status === "completed" && !runner.isBusy(chat.id));
  await runner.send(chat.id, "/compact 決めたことを残して");
  await until(() => seen.length === 2 && !runner.isBusy(chat.id));
  await runner.compact(chat.id);
  await until(() => seen.length === 3 && !runner.isBusy(chat.id));
  assert.deepEqual(
    seen.map(([prompt, live]) => [prompt.split(" ")[0], live?.trigger]),
    [
      ["続けて", "auto"],
      ["/compact", "manual"],
      ["/compact", "manual"],
    ],
  );
  // 圧縮している間は始めた時刻を持ち、終われば消える
  assert.ok(seen.every(([, live]) => typeof live?.since === "string"));
  assert.equal(runner.live(chat.id).compacting, null);
  const notices = store.events.list(chat.id).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
  assert.deepEqual(notices, ["会話の圧縮に失敗しました（too long）", "会話の圧縮に失敗しました（too long）"]);
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
  const fresh = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "completed", model: null });
  await assert.rejects(runner.compact(fresh.id), /まだ会話がない/);

  const chat = await runner.start({ projectId: project.id, prompt: "こんにちは" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  store.chats.setUnread(chat.id, false);
  const before = store.chats.get(chat.id)!;
  const eventsBefore = store.events.list(chat.id).length;

  await runner.compact(chat.id);
  await until(() => !runner.isBusy(chat.id) && store.chats.get(chat.id)?.status === "completed");
  const after = store.chats.get(chat.id)!;
  assert.equal(provider.calls.at(-1)?.prompt, "/compact");
  assert.equal(provider.calls.at(-1)?.resumeSessionId, "s1");
  const added = store.events.list(chat.id).slice(eventsBefore);
  assert.deepEqual(
    added.map((e) => e.type),
    ["compact"],
  );
  assert.equal(after.unread, false);
  assert.equal(after.num_turns, before.num_turns);
  assert.equal(after.context_tokens, 18_000);
});
