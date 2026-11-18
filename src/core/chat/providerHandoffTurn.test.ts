import assert from "node:assert/strict";
import { test } from "vitest";
import { PROVIDER_BASE_CHAT_OPTIONS } from "@shared/chat/chatOptions";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore, until } from "../testing/testCore.js";

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
