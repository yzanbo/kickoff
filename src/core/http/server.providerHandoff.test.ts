import assert from "node:assert/strict";
import { test } from "vitest";
import { PROVIDER_BASE_CHAT_OPTIONS } from "@shared/chat/chatOptions";
import { setup } from "../testing/testServer.js";

test("引き継ぎの状態を返し、古い区切りや未確認の再送を断る", async () => {
  const { call, store, project, provider } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "会話の資料", state: "ready", error: null, attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false });
  store.chatProviderHandoffs.claim(chat.id, switched.event.id, "codex");
  store.chatProviderHandoffs.markUncertain(chat.id, switched.event.id, "受信不明");
  const state = await call("GET", `/api/chats/${chat.id}/provider-handoff`);
  assert.equal(state.body.state, "uncertain");
  assert.equal(state.body.event_id, switched.event.id);
  assert.equal(state.body.context, "会話の資料");
  assert.equal((await call("POST", `/api/chats/${chat.id}/provider-handoff/retry`, { event_id: switched.event.id })).status, 409);
  assert.equal((await call("POST", `/api/chats/${chat.id}/provider-handoff/confirm-resend`, { event_id: switched.event.id })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chat.id}/provider-handoff/confirm-resend`, { event_id: switched.event.id + 1, confirm_duplicate_risk: true })).status, 409);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "uncertain");
  assert.equal(provider.prompts.length, 0);
  assert.equal((await call("GET", "/api/chats/999999/provider-handoff")).status, 404);
});

test("準備に失敗した引き継ぎは同じ区切りで再試行できる", async () => {
  const { call, store, project } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const switched = store.commitProviderSwitch({ chatId: chat.id, expectedProvider: "claude", target: "codex", options: PROVIDER_BASE_CHAT_OPTIONS, context: "", state: "blocked", error: "準備に失敗", attachments: [], expectedLastEventId: null, afterEventId: null, currentLastEventId: null, queueWasPaused: false });
  assert.equal((await call("POST", `/api/chats/${chat.id}/provider-handoff/retry`, { event_id: switched.event.id + 1 })).status, 409);
  assert.equal((await call("POST", `/api/chats/${chat.id}/provider-handoff/retry`, { event_id: switched.event.id })).status, 200);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "ready");
});
