import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider } from "@/features/ai/core/testing/fakeProvider";
import { setupCore } from "@/app/core/testing/testCore";
import { Store } from "@/foundation/core/db/store";
import { tempDir } from "@/foundation/core/testing/tempDir";
import path from "node:path";

test("AI 切り替えの引き継ぎ内容と送信状態は、チャット・記録にひも付けて保存する", () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "a", status: "completed" });
  const event = store.events.add(chat.id, { type: "provider_switched", from: "claude", to: "codex" });
  const original = { chatId: chat.id, eventId: event.id, provider: "codex" as const, context: "会話の記録", state: "ready" as const, error: null, lastEventId: 4, queueWasPaused: true };
  store.chatProviderHandoffs.save(original);
  assert.deepEqual(store.chatProviderHandoffs.get(chat.id), original);
  store.chatProviderHandoffs.save({ ...original, state: "uncertain", error: "通信切断" });
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "uncertain");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.error, "通信切断");
  store.chatProviderHandoffs.remove(chat.id);
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
});

test("アプリを再起動しても送信中の状態を失わない", () => {
  const file = path.join(tempDir(), "db.sqlite");
  const store = new Store(file);
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "a", status: "completed" });
  const event = store.events.add(chat.id, { type: "provider_switched", from: "claude", to: "codex" });
  store.chatProviderHandoffs.save({ chatId: chat.id, eventId: event.id, provider: "codex", context: "文脈", state: "sending", error: null, lastEventId: null, queueWasPaused: false });
  store.close();
  const reopened = new Store(file);
  assert.equal(reopened.chatProviderHandoffs.get(chat.id)?.state, "sending");
  assert.equal(reopened.chatProviderHandoffs.get(chat.id)?.context, "文脈");
  assert.equal(reopened.chatProviderHandoffs.recoverInterrupted(), 1);
  assert.equal(reopened.chatProviderHandoffs.get(chat.id)?.state, "uncertain");
  assert.equal(reopened.chatProviderHandoffs.recoverInterrupted(), 0);
  reopened.close();
});

test("引き継ぎは同じ区切り・AI で 1 回だけ送信を開始し、受信不明なら自動再送しない", () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "a", status: "completed" });
  const event = store.events.add(chat.id, { type: "provider_switched", from: "claude", to: "codex" });
  store.chatProviderHandoffs.save({ chatId: chat.id, eventId: event.id, provider: "codex", context: "文脈", state: "ready", error: null, lastEventId: null, queueWasPaused: false });
  assert.equal(store.chatProviderHandoffs.claim(chat.id, event.id, "claude"), false);
  assert.equal(store.chatProviderHandoffs.claim(chat.id, event.id + 1, "codex"), false);
  assert.equal(store.chatProviderHandoffs.claim(chat.id, event.id, "codex"), true);
  assert.equal(store.chatProviderHandoffs.claim(chat.id, event.id, "codex"), false);
  assert.equal(store.chatProviderHandoffs.markUncertain(chat.id, event.id, "通信切断"), true);
  assert.equal(store.chatProviderHandoffs.claim(chat.id, event.id, "codex"), false);
  assert.equal(store.chatProviderHandoffs.complete(chat.id, event.id), false);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.error, "通信切断");
});
