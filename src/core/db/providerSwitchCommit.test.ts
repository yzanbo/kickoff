import assert from "node:assert/strict";
import { test } from "vitest";
import { PROVIDER_BASE_CHAT_OPTIONS } from "@shared/chat/chatOptions";
import { Store } from "./store.js";

function setup() {
  const store = new Store(":memory:");
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "既存", status: "completed", sandbox_enabled: false, edit_scope_enabled: true });
  store.chats.update(chat.id, { session_id: "claude-session" });
  store.chatProviderSessions.save(chat.id, "codex", "codex-session", 4);
  return { store, chat };
}

test("AI の変更・履歴の区切り・次回送信用の引き継ぎを一緒に保存する", () => {
  const { store, chat } = setup();
  const result = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: { ...PROVIDER_BASE_CHAT_OPTIONS, permission_mode: "auto" }, context: "引き継ぎ", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: 4, currentLastEventId: 9, queueWasPaused: true });
  assert.equal(result.chat.provider, "codex");
  assert.equal(result.chat.session_id, "codex-session");
  assert.equal(result.chat.permission_mode, "auto");
  assert.equal(result.chat.sandbox_enabled, false);
  assert.equal(result.chat.edit_scope_enabled, true);
  assert.deepEqual(result.event.data, { from: "claude", to: "codex" });
  assert.equal(store.chatProviderSessions.get(chat.id, "claude")?.last_event_id, 9);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.eventId, result.event.id);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.queueWasPaused, true);
  store.close();
});

test("切り替え直前に状態が変わったとき、何も変更しない", () => {
  const { store, chat } = setup();
  const input = { chatId: chat.id, expectedProvider: "codex" as const, target: "claude" as const, options: PROVIDER_BASE_CHAT_OPTIONS, context: "", state: "ready" as const, error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false };
  assert.throws(() => store.commitProviderSwitch(input), /状態が変わった/);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.deepEqual(store.events.list(chat.id), []);
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
  store.close();
});

test("引き継ぎの準備中に会話が増えていたら古い文脈で切り替えない", () => {
  const { store, chat } = setup();
  store.events.add(chat.id, { type: "user", text: "新しい発言", message_uuid: "m" });
  assert.throws(() => store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "古い会話", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false }), /会話が変わった/);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.equal(store.events.list(chat.id).length, 1);
  store.close();
});

test("引き継ぎの保存に失敗したら、セッション・区切り・AI をまとめて元に戻す", () => {
  const { store, chat } = setup();
  store.db.exec("CREATE TRIGGER fail_handoff BEFORE INSERT ON chat_provider_handoffs BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.throws(() => store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "x", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: 99, queueWasPaused: false }), /test failure/);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.equal(store.chats.get(chat.id)?.session_id, "claude-session");
  assert.equal(store.chatProviderSessions.get(chat.id, "claude")?.last_event_id, null);
  assert.deepEqual(store.events.list(chat.id), []);
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
  store.close();
});
