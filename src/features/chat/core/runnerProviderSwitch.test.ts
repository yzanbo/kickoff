import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider } from "@/features/ai/core/testing/fakeProvider";
import { setupCore } from "@/app/core/testing/testCore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { UploadStore } from "@/features/attachments/core/uploads";

test("Runner の切り替えは待っている指示の ID と停止状態を保存し、AI を起動しない", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const { store, runner, project } = setupCore(provider, { uploads: new UploadStore(tempDir()) });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  await runner.queueMessage(chat.id, "後で送る", { permission_mode: "auto" }, [], { hold: true });
  await runner.setQueuePaused(chat.id, true);
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
  const { store, runner, project } = setupCore(provider, { uploads: new UploadStore(tempDir()) });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  await runner.queueMessage(chat.id, "待つ", {}, [], { hold: true });
  await runner.setQueuePaused(chat.id, true);
  const first = runner.queueState(chat.id).messages[0];
  const switching = runner.switchProvider(chat.id, "claude", "codex");
  await assert.rejects(runner.sendQueuedNow(chat.id, first.id), /引き継ぎを確認/);
  await assert.rejects(runner.tell(chat.id, "いま"), /切り替え中/);
  await runner.queueMessage(chat.id, "追加", {}, [], { hold: true });
  release();
  await assert.rejects(switching, /送信待ちやチャットの状態が変わった/);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.deepEqual(runner.queueState(chat.id).messages.map((m) => m.text), ["待つ", "追加"]);
});

test("切り替え先が使えなければ元の AI のままにする", async () => {
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const originalStatus = provider.status.bind(provider);
  provider.status = async () => ({ ...await originalStatus(), installed: false });
  const { store, runner, project } = setupCore(provider, { uploads: new UploadStore(tempDir()) });
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
  const { store, runner, project } = setupCore(provider, { uploads: new UploadStore(tempDir()) });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const switching = runner.switchProvider(chat.id, "claude", "codex");
  await runner.queueMessage(chat.id, "切り替え中の指示");
  release();
  await assert.rejects(switching, /送信待ちやチャットの状態が変わった/);
  assert.equal(runner.queueState(chat.id).paused, true);
  assert.equal(runner.queueState(chat.id).messages[0].text, "切り替え中の指示");
  assert.equal(provider.calls.length, 0);
});
