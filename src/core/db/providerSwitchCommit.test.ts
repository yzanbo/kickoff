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
  assert.deepEqual(result.event.data, { from: "claude", to: "codex", handoff_context: "引き継ぎ", handoff_status: "ready" });
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

test("引き継ぎの完了と、AI の再開位置の更新は同時に行う", () => {
  const { store, chat } = setup();
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "x", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false });
  assert.equal(store.chatProviderHandoffs.claim(chat.id, switched.event.id, "codex"), true);
  assert.equal(store.completeProviderHandoff(chat.id, switched.event.id, "codex", "wrong", 20), false);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "sending");
  assert.equal(store.completeProviderHandoff(chat.id, switched.event.id, "codex", "codex-session", 20), true);
  const event = store.events.get(switched.event.id);
  assert.equal(event?.type === "provider_switched" && event.data.handoff_status, "delivered");
  assert.equal(event?.type === "provider_switched" && event.data.handoff_context, "x");
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
  assert.equal(store.chatProviderSessions.get(chat.id, "codex")?.last_event_id, 20);
  store.close();
});

test("引き継ぎの再準備の保存が失敗したら、資料の参照と状態をまとめて元に戻す", () => {
  const { store, chat } = setup();
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "古い資料", state: "blocked", error: "失敗", attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: true });
  store.db.exec("CREATE TRIGGER fail_retry BEFORE UPDATE ON chat_provider_handoffs BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.throws(() => store.retryProviderHandoff(chat.id, switched.event.id, "codex", "新しい資料", []), /test failure/);
  assert.deepEqual(store.events.get(switched.event.id)?.data, switched.event.data);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.context, "古い資料");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "blocked");
  store.close();
});

test("受信不明の引き継ぎは準備の再試行では送信可能に戻せない", () => {
  const { store, chat } = setup();
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "資料", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false });
  store.chatProviderHandoffs.claim(chat.id, switched.event.id, "codex");
  store.chatProviderHandoffs.markUncertain(chat.id, switched.event.id, "受信不明");
  assert.equal(store.retryProviderHandoff(chat.id, switched.event.id, "codex", "新しい資料", []), false);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "uncertain");
  store.close();
});

test("消失したセッションの切り離しに失敗したら再開先と保留状態を元に戻す", () => {
  const { store, chat } = setup();
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "資料", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: 4, currentLastEventId: null, queueWasPaused: false });
  store.chatProviderHandoffs.claim(chat.id, switched.event.id, "codex");
  store.db.exec("CREATE TRIGGER fail_missing BEFORE UPDATE ON chat_provider_handoffs BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.throws(() => store.markProviderSessionMissing(chat.id, switched.event.id, "codex", "codex-session"), /test failure/);
  assert.equal(store.chats.get(chat.id)?.session_id, "codex-session");
  assert.equal(store.chatProviderSessions.get(chat.id, "codex")?.session_id, "codex-session");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "sending");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.lastEventId, 4);
  store.close();
});

test("自動の再準備は資料と送信中の印を同時に保存し、中断後に勝手に再送しない", () => {
  const { store, chat } = setup();
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "古い資料", state: "blocked", error: "失敗", attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false });
  assert.equal(store.retryProviderHandoff(chat.id, switched.event.id, "codex", "新しい資料", [], true), true);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "sending");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.context, "新しい資料");
  assert.equal(store.chatProviderHandoffs.recoverInterrupted(), 1);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "uncertain");
  store.close();
});

test("送る前の準備済みの引き継ぎは、替え直すと置き換え、前の区切りに渡していない印を付ける", () => {
  const { store, chat } = setup();
  const base = { options: PROVIDER_BASE_CHAT_OPTIONS, context: "x", state: "ready" as const, error: null, attachments: [], afterEventId: null, currentLastEventId: null, queueWasPaused: false };
  const first = store.commitProviderSwitch({ ...base, chatId: chat.id, expectedProvider: "claude", target: "codex", expectedLastEventId: null });
  const back = store.commitProviderSwitch({ ...base, chatId: chat.id, expectedProvider: "codex", target: "claude", expectedLastEventId: first.event.id, context: "戻す" });
  assert.equal(back.chat.provider, "claude");
  assert.equal(back.chat.session_id, "claude-session");
  const old = store.events.get(first.event.id);
  assert.equal(old?.type === "provider_switched" && old.data.handoff_status, "superseded");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.eventId, back.event.id);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.context, "戻す");
  store.close();
});

test("準備の失敗・送信中・受信不明の引き継ぎがあれば、替え直さない", () => {
  for (const state of ["blocked", "sending", "uncertain"] as const) {
    const { store, chat } = setup();
    const base = { options: PROVIDER_BASE_CHAT_OPTIONS, context: "x", error: null, attachments: [], afterEventId: null, currentLastEventId: null, queueWasPaused: false };
    const first = store.commitProviderSwitch({ ...base, state: "ready", chatId: chat.id, expectedProvider: "claude", target: "codex", expectedLastEventId: null });
    store.chatProviderHandoffs.save({ ...store.chatProviderHandoffs.get(chat.id)!, state });
    assert.throws(() => store.commitProviderSwitch({ ...base, state: "ready", chatId: chat.id, expectedProvider: "codex", target: "claude", expectedLastEventId: first.event.id }), /切り替え/);
    assert.equal(store.chats.get(chat.id)?.provider, "codex");
    assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, state);
    const old = store.events.get(first.event.id);
    assert.equal(old?.type === "provider_switched" && old.data.handoff_status, "ready");
    store.close();
  }
});
