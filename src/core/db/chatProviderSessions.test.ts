import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore } from "../testing/testCore.js";

test("AI ごとのセッションと引き継ぎ位置をチャットごとに分けて保存する", () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "a", status: "completed" });
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "b", status: "completed" });
  store.chatProviderSessions.save(chat.id, "claude", "claude-1", 12);
  store.chatProviderSessions.save(chat.id, "codex", "codex-1", null);
  store.chatProviderSessions.save(other.id, "claude", "claude-2", 15);
  store.chatProviderSessions.save(chat.id, "claude", "claude-3", 20);
  assert.deepEqual(store.chatProviderSessions.get(chat.id, "claude"), { chat_id: chat.id, provider: "claude", session_id: "claude-3", last_event_id: 20 });
  assert.equal(store.chatProviderSessions.get(chat.id, "codex")?.session_id, "codex-1");
  assert.equal(store.chatProviderSessions.get(other.id, "claude")?.session_id, "claude-2");
  assert.equal(store.chatProviderSessions.list(chat.id).length, 2);
  store.chatProviderSessions.remove(chat.id, "claude");
  assert.equal(store.chatProviderSessions.get(chat.id, "claude"), undefined);
  assert.equal(store.chatProviderSessions.get(chat.id, "codex")?.session_id, "codex-1");
  assert.throws(() => store.chatProviderSessions.save(chat.id, "claude", "", null));
});

test("現在のセッションの更新と消去を保存先に反映し、他の AI の再開先は保護する", () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "a", status: "completed" });
  store.chats.update(chat.id, { session_id: "claude-1" });
  store.chatProviderSessions.save(chat.id, "claude", "claude-1", 42);
  store.chatProviderSessions.save(chat.id, "codex", "codex-1", 50);
  store.chats.update(chat.id, { session_id: "claude-1" });
  assert.equal(store.chatProviderSessions.get(chat.id, "claude")?.last_event_id, 42);
  store.chats.update(chat.id, { session_id: "claude-2" });
  assert.equal(store.chatProviderSessions.get(chat.id, "claude")?.last_event_id, null);
  assert.equal(store.events.sessionInUse("codex-1"), true);
  assert.equal(store.events.usedSessionIds().has("codex-1"), true);
  store.chats.update(chat.id, { session_id: null });
  assert.equal(store.chatProviderSessions.get(chat.id, "claude"), undefined);
  assert.equal(store.chatProviderSessions.get(chat.id, "codex")?.session_id, "codex-1");
});
