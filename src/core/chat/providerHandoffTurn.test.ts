import assert from "node:assert/strict";
import { test } from "vitest";
import { PROVIDER_BASE_CHAT_OPTIONS } from "@shared/chat/chatOptions";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore, until } from "../testing/testCore.js";
import { UploadStore } from "./uploads.js";
import { tempDir } from "../testing/tempDir.js";

function switched(provider: ScriptedProvider, state: "ready" | "blocked" = "ready") {
  const ctx = setupCore(provider);
  const chat = ctx.store.chats.create({ project_id: ctx.project.id, provider: "claude", title: "c", status: "completed" });
  ctx.store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "引き継ぐ会話", state, error: state === "blocked" ? "準備に失敗" : null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false });
  return { ...ctx, chatId: chat.id };
}

test("切り替え後の最初の指示に会話を添え、完了後は再開位置を保存して保留を外す", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "codex-1", lastMessageId: "answer", result: "完了" }));
  const { store, runner, chatId } = switched(provider);
  await runner.send(chatId, "続けて");
  await until(() => !runner.isBusy(chatId) && provider.calls.length === 1);
  assert.match(provider.calls[0].turnContext ?? "", /引き継ぐ会話/);
  assert.equal(store.chatProviderHandoffs.get(chatId), undefined);
  assert.equal(store.chatProviderSessions.get(chatId, "codex")?.session_id, "codex-1");
  assert.ok(store.chatProviderSessions.get(chatId, "codex")?.last_event_id);
  await runner.send(chatId, "もう一度");
  await until(() => !runner.isBusy(chatId) && provider.calls.length === 2);
  assert.doesNotMatch(provider.calls[1].turnContext ?? "", /引き継ぐ会話/);
});

test("引き継ぎ準備が失敗中なら、送信待ちを取り出したり指示を送ったりしない", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const { store, runner, chatId } = switched(provider, "blocked");
  await runner.queueMessage(chatId, "待ち", {}, [], { hold: true });
  const queued = runner.queueState(chatId).messages[0];
  await assert.rejects(runner.sendQueuedNow(chatId, queued.id), /引き継ぎを確認/);
  await assert.rejects(runner.send(chatId, "新しい指示"), /引き継ぎを確認/);
  await assert.rejects(runner.sendQueuedInOrder(chatId), /引き継ぎを確認/);
  assert.equal(runner.queueState(chatId).messages[0].id, queued.id);
  assert.equal(store.chatProviderHandoffs.get(chatId)?.state, "blocked");
  assert.equal(provider.calls.length, 0);
});

test("引き継ぎが完了する前の圧縮・コンテキスト消去は待ちの列から取り出さない", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const { runner, chatId } = switched(provider);
  runner.queueAction(chatId, "clear");
  const queued = runner.queueState(chatId).messages[0];
  await assert.rejects(runner.sendQueuedNow(chatId, queued.id), /引き継ぎが終わるまで/);
  await runner.setQueuePaused(chatId, false);
  assert.equal(runner.queueState(chatId).messages[0].id, queued.id);
  await assert.rejects(runner.compact(chatId), /引き継ぎが終わるまで/);
  assert.throws(() => runner.clearContext(chatId), /引き継ぎが終わるまで/);
  assert.equal(provider.calls.length, 0);
});

test("切り替え前の送信待ちは元の AI の設定を外し、切り替え後に足した指示の設定は残す", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "codex-1", result: "完了" }));
  const { store, runner, project } = setupCore(provider);
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  await runner.queueMessage(chat.id, "旧 AI で予約", { permission_mode: "auto" }, [], { hold: true });
  const old = runner.queueState(chat.id).messages[0];
  store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "記録", state: "ready", error: null, attachments: [], queuedIds: [old.id], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: true });
  await runner.queueMessage(chat.id, "新 AI で予約", { permission_mode: "acceptEdits" }, [], { hold: true });
  await runner.setQueuePaused(chat.id, true);
  await runner.sendQueuedNow(chat.id, old.id);
  await until(() => !runner.isBusy(chat.id) && provider.calls.length === 1);
  assert.equal(provider.calls[0].permissionMode, "default");
  assert.equal(runner.queueState(chat.id).messages[0].options.permission_mode, "acceptEdits");
});

test("引き継ぎ送信中に通信が切れたら、受信不明にして自動再送・次の送信待ちを止める", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "failed", sessionId: "codex-1", error: "切断", network: true }));
  const { store, runner, chatId } = switched(provider);
  await runner.queueMessage(chatId, "後の指示", {}, [], { hold: true });
  await runner.send(chatId, "最初の指示");
  await until(() => !runner.isBusy(chatId) && store.chatProviderHandoffs.get(chatId)?.state === "uncertain");
  assert.equal(provider.calls.length, 1);
  assert.equal(runner.queueState(chatId).messages.length, 1);
  await assert.rejects(runner.send(chatId, "再送"), /引き継ぎを確認/);
  assert.equal(provider.calls.length, 1);
});

test("受信不明では確認せず再送せず、利用者が対象の切り替えを明示したときだけ再送する", async () => {
  let calls = 0;
  const provider = new ScriptedProvider(async () => ++calls === 1 ? { status: "failed", sessionId: "s", error: "切断", network: true } : { status: "completed", sessionId: "s", result: "完了" });
  const { store, runner, project } = setupCore(provider, { uploads: new UploadStore(tempDir()) });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "記録", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false });
  await runner.send(chat.id, "最初の指示");
  await until(() => !runner.isBusy(chat.id) && store.chatProviderHandoffs.get(chat.id)?.state === "uncertain");
  await assert.rejects(runner.retryProviderHandoff(chat.id), /再試行できる/);
  await assert.rejects(runner.confirmResendProviderHandoff(chat.id, switched.event.id + 1), /状態が変わりました/);
  assert.equal(calls, 1);
  await runner.confirmResendProviderHandoff(chat.id, switched.event.id);
  await until(() => !runner.isBusy(chat.id) && calls === 2);
  assert.equal(store.events.list(chat.id).filter((event) => event.type === "user").length, 1);
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
});

test("AI を呼ぶ前に準備が失敗した場合は、引き継ぎを blocked にして後の指示を送らない", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const { store, project, runner, chatId } = switched(provider);
  store.projects.update(project.id, { repo_path: "/private/tmp/kickoff-missing-workdir-for-handoff-test" });
  await runner.queueMessage(chatId, "後の指示", {}, [], { hold: true });
  await runner.send(chatId, "最初の指示");
  await until(() => !runner.isBusy(chatId) && store.chatProviderHandoffs.get(chatId)?.state === "blocked");
  assert.equal(provider.calls.length, 0);
  assert.equal(runner.queueState(chatId).messages.length, 1);
  assert.match(store.chatProviderHandoffs.get(chatId)?.error ?? "", /作業場所/);
});

test("送信前の失敗を再試行すると元の発言を重複させず同じ指示から再開する", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s", result: "完了" }));
  const { store, project, runner } = setupCore(provider, { uploads: new UploadStore(tempDir()) });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "記録", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: true });
  store.projects.update(project.id, { repo_path: "/private/tmp/kickoff-missing-workdir-for-handoff-test" });
  await runner.send(chat.id, "最初の指示");
  await until(() => !runner.isBusy(chat.id) && store.chatProviderHandoffs.get(chat.id)?.state === "blocked");
  store.projects.update(project.id, { repo_path: project.repo_path });
  await runner.retryProviderHandoff(chat.id);
  await until(() => !runner.isBusy(chat.id) && provider.calls.length === 1);
  assert.match(provider.calls[0].prompt, /最初の指示/);
  assert.equal(store.events.list(chat.id).filter((event) => event.type === "user").length, 1);
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
});

test("再起動時に送信中だった引き継ぎは受信不明として保持し、自動再送しない", () => {
  let id = 0;
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const { store, runner } = setupCore(provider, {}, (saved, project) => {
    const chat = saved.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
    const event = saved.events.add(chat.id, { type: "provider_switched", from: "codex", to: "claude" });
    saved.chatProviderHandoffs.save({ chatId: chat.id, eventId: event.id, provider: "claude", context: "記録", state: "sending", error: null, lastEventId: null, queueWasPaused: false });
    id = chat.id;
    return [];
  });
  assert.equal(store.chatProviderHandoffs.get(id)?.state, "uncertain");
  assert.equal(provider.calls.length, 0);
  assert.equal(runner.isBusy(id), false);
});
