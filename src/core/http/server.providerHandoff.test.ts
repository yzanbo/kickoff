import assert from "node:assert/strict";
import { test } from "vitest";
import { PROVIDER_BASE_CHAT_OPTIONS } from "@shared/chat/chatOptions";
import { setup, until } from "../testing/testServer.js";

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
  const detail = await call("GET", `/api/chats/${chat.id}/provider-handoff/${switched.event.id}`);
  assert.equal(detail.body.event.data.handoff_context, "会話の資料");
  assert.equal(detail.body.pending.state, "uncertain");
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "別", status: "completed" });
  assert.equal((await call("GET", `/api/chats/${other.id}/provider-handoff/${switched.event.id}`)).status, 404);
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

test("AI の切り替えは確認した条件が変わったら拒否し、再確認後に確定する", async () => {
  const { call, store, runner, project, provider } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const url = `/api/chats/${chat.id}/provider-switch`;
  const first = await call("GET", `${url}?target=codex`);
  assert.equal(first.status, 200);
  assert.equal(first.body.from, "claude");
  assert.equal(first.body.to, "codex");
  assert.equal(first.body.queued_ids.length, 0);
  await runner.queueMessage(chat.id, "待ち", {}, [], { hold: true });
  await runner.setQueuePaused(chat.id, true);
  assert.equal((await call("POST", url, { target: "codex", confirmation: first.body.confirmation })).status, 409);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  const next = await call("GET", `${url}?target=codex`);
  assert.equal(next.body.queued_ids.length, 1);
  const result = await call("POST", url, { target: "codex", confirmation: next.body.confirmation });
  assert.equal(result.status, 200);
  assert.equal(result.body.chat.provider, "codex");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "ready");
  assert.equal(provider.prompts.length, 0);
});

test("切り替えの準備中に権限の既定が変わったら確定しない", async () => {
  const { call, store, project, provider } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const url = `/api/chats/${chat.id}/provider-switch`;
  const preview = await call("GET", `${url}?target=codex`);
  const originalStatus = provider.status.bind(provider);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  provider.status = async () => { entered(); await gate; return originalStatus(); };
  const switching = call("POST", url, { target: "codex", confirmation: preview.body.confirmation });
  await started;
  store.settings.update({ provider_chat_defaults: { codex: { model: null, effort: null, permission_mode: "auto", fast_mode: false } } });
  release();
  assert.equal((await switching).status, 409);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.equal(store.chatProviderHandoffs.get(chat.id), undefined);
});

test("同じチャットで AI を切り替えて続け、元の AI に戻したときは前のセッションを再開する", async () => {
  const { call, store, runner, project, provider } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const send = async (text: string, count: number) => {
    assert.equal((await call("POST", `/api/chats/${chat.id}/messages`, { text })).status, 200);
    await until(() => !runner.isBusy(chat.id) && provider.prompts.length === count);
  };
  const change = async (target: "claude" | "codex") => {
    const url = `/api/chats/${chat.id}/provider-switch`;
    const preview = await call("GET", `${url}?target=${target}`);
    assert.equal(preview.status, 200);
    assert.equal((await call("POST", url, { target, confirmation: preview.body.confirmation })).status, 200);
  };
  await send("最初の話", 1);
  await change("codex");
  assert.equal(provider.prompts.length, 1);
  await send("Codex への指示", 2);
  assert.match(provider.lastTurnContext ?? "", /最初の話/);
  await change("claude");
  await send("続きをお願い", 3);
  assert.equal(provider.resumes[2], "s1");
  assert.match(provider.lastTurnContext ?? "", /Codex への指示/);
  assert.doesNotMatch(provider.lastTurnContext ?? "", /最初の話/);
  assert.equal(store.events.list(chat.id).filter((event) => event.type === "provider_switched").length, 2);
});
