import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider } from "@/features/ai/core/testing/fakeProvider";
import { setupCore, testUploads } from "@/app/core/testing/testCore";

test("Runner の切り替えは待っている指示の ID と停止状態を保存し、AI を起動しない", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const { store, runner, project } = setupCore(provider, { uploads: testUploads() });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  await runner.message(chat.id, { text: "後で送る", options: { permission_mode: "auto" }, hold: true, when: "later" });
  await runner.queue(chat.id, [{ op: "set_paused", paused: true }]);
  const queued = runner.queueState(chat.id).messages[0];
  const result = await runner.switchProvider(chat.id, "claude", "codex");
  assert.equal(result.chat.provider, "codex");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.queueWasPaused, true);
  const event = store.events.get(store.chatProviderHandoffs.get(chat.id)!.eventId)!;
  assert.equal(event.type, "provider_switched");
  if (event.type !== "provider_switched") throw new Error("unexpected event");
  assert.deepEqual(event.data.queued_ids, [queued.id]);
  assert.equal(provider.calls.length, 0);
  assert.equal(runner.queueState(chat.id).messages.length, 1);
});

test("切り替え準備中の割り込み送信は待ちの指示を消さず、待ちが変われば切り替えを中止する", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const originalStatus = provider.status.bind(provider);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  provider.status = async () => { await gate; return originalStatus(); };
  const { store, runner, project } = setupCore(provider, { uploads: testUploads() });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  await runner.message(chat.id, { text: "待つ", hold: true, when: "later" });
  await runner.queue(chat.id, [{ op: "set_paused", paused: true }]);
  const first = runner.queueState(chat.id).messages[0];
  const switching = runner.switchProvider(chat.id, "claude", "codex");
  await assert.rejects(runner.queueSend(chat.id, { mode: "now", ids: [first.id] }), /引き継ぎを確認/);
  await assert.rejects(runner.message(chat.id, { text: "いま", when: "now" }), /切り替え中/);
  await runner.message(chat.id, { text: "追加", hold: true, when: "later" });
  release();
  await assert.rejects(switching, /送信待ちやチャットの状態が変わった/);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.deepEqual(runner.queueState(chat.id).messages.map((m) => m.text), ["待つ", "追加"]);
});

test("切り替え先が使えなければ元の AI のままにする", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const originalStatus = provider.status.bind(provider);
  provider.status = async () => ({ ...await originalStatus(), installed: false });
  const { store, runner, project } = setupCore(provider, { uploads: testUploads() });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  await assert.rejects(runner.switchProvider(chat.id, "claude", "codex"), /利用できません/);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
  assert.equal(runner.isBusy(chat.id), false);
});

test("切り替え中に増えた指示は、切り替え中止後に元の AI へ自動送信しない", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const originalStatus = provider.status.bind(provider);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  provider.status = async () => { await gate; return originalStatus(); };
  const { store, runner, project } = setupCore(provider, { uploads: testUploads() });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const switching = runner.switchProvider(chat.id, "claude", "codex");
  await runner.message(chat.id, { text: "切り替え中の指示", when: "later" });
  release();
  await assert.rejects(switching, /送信待ちやチャットの状態が変わった/);
  assert.equal(runner.queueState(chat.id).paused, true);
  assert.equal(runner.queueState(chat.id).messages[0].text, "切り替え中の指示");
  assert.equal(provider.calls.length, 0);
});
