import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { setupCore } from "@/app/core/testing/testCore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { prepareAndCommitProviderSwitch, retryProviderHandoffPreparation } from "./providerSwitch";
import { UploadStore } from "@/features/attachments/core";

const git = async () => ({ context: "Git の状態: main", warning: null });

test("AI を切り替えると会話と Git を準備し、対象 AI の既定と以前のセッションを保存する", async () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "x" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  store.chats.update(chat.id, { session_id: "claude-1" });
  store.events.add(chat.id, { type: "user", text: "最初", message_uuid: "1" });
  const result = store.events.add(chat.id, { type: "result", status: "completed", session_id: "claude-1", message_id: "a" });
  store.chatProviderSessions.save(chat.id, "codex", "codex-1", null);
  store.settings.update({ provider_chat_defaults: { codex: { model: null, effort: null, permission_mode: "auto", fast_mode: false } } });
  const changed = await prepareAndCommitProviderSwitch({ store, uploads: new UploadStore(tempDir()), requireIdle: () => {}, git }, { chatId: chat.id, expectedProvider: "claude", target: "codex", queueWasPaused: false });
  assert.equal(changed.chat.provider, "codex");
  assert.equal(changed.chat.session_id, "codex-1");
  assert.equal(changed.chat.permission_mode, "auto");
  assert.equal(store.chatProviderSessions.get(chat.id, "claude")?.last_event_id, result.id);
  assert.match(store.chatProviderHandoffs.get(chat.id)!.context, /最初/);
  assert.match(store.chatProviderHandoffs.get(chat.id)!.context, /Git の状態: main/);
  assert.equal(store.chatProviderHandoffs.get(chat.id)!.state, "ready");
  assert.equal(store.events.list(chat.id).at(-1)?.type, "provider_switched");
  assert.equal(changed.warning, null);
});

test("準備に失敗しても AI を切り替えるが、引き継ぎを再試行するまで blocked にする", async () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "x" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  store.events.add(chat.id, { type: "user", text: "長".repeat(20_001), message_uuid: "1" });
  const uploads = new UploadStore(tempDir());
  const changed = await prepareAndCommitProviderSwitch({ store, uploads: { save: async () => { throw new Error("保存できません"); }, resolve: (id) => uploads.resolve(id), remove: (id) => uploads.remove(id) }, requireIdle: () => {}, git }, { chatId: chat.id, expectedProvider: "claude", target: "codex", queueWasPaused: true });
  assert.equal(changed.chat.provider, "codex");
  assert.match(changed.warning ?? "", /保存できません/);
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.state, "blocked");
  assert.equal(store.chatProviderHandoffs.get(chat.id)?.queueWasPaused, true);
});

test("準備の間に会話が増えたら切り替えず、作った長文ファイルを片付ける", async () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "x" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  store.events.add(chat.id, { type: "user", text: "長".repeat(20_001), message_uuid: "1" });
  const uploads = new UploadStore(tempDir());
  const created: string[] = [];
  await assert.rejects(prepareAndCommitProviderSwitch({ store, uploads: { save: async (file) => { const saved = await uploads.save(file); created.push(saved.id); return saved; }, resolve: (id) => uploads.resolve(id), remove: (id) => uploads.remove(id) }, requireIdle: () => {}, git: async () => { store.events.add(chat.id, { type: "notice", message: "更新" }); return git(); } }, { chatId: chat.id, expectedProvider: "claude", target: "codex", queueWasPaused: false }), /会話が変わった/);
  assert.equal(store.chats.get(chat.id)?.provider, "claude");
  assert.equal(await uploads.resolve(created[0]), undefined);
});

test("準備の失敗は切り替え時点の会話でやり直し、長文の参照先とともに保存する", async () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "x" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  store.events.add(chat.id, { type: "user", text: "長".repeat(20_001), message_uuid: "1" });
  const uploads = new UploadStore(tempDir());
  const broken = { save: async () => { throw new Error("保存できません"); }, resolve: (id: string) => uploads.resolve(id), remove: (id: string) => uploads.remove(id) };
  await prepareAndCommitProviderSwitch({ store, uploads: broken, requireIdle: () => {}, git }, { chatId: chat.id, expectedProvider: "claude", target: "codex", queueWasPaused: true });
  store.events.add(chat.id, { type: "user", text: "切り替え後の指示", message_uuid: "2" });
  await retryProviderHandoffPreparation({ store, uploads, requireIdle: () => {}, git }, chat.id);
  const pending = store.chatProviderHandoffs.get(chat.id)!;
  assert.equal(pending.state, "ready");
  assert.equal(pending.queueWasPaused, true);
  assert.doesNotMatch(pending.context, /切り替え後の指示/);
  const event = store.events.get(pending.eventId)!;
  assert.equal(event.type, "provider_switched");
  if (event.type !== "provider_switched") throw new Error("unexpected event");
  assert.equal(event.data.handoff_attachments?.length, 1);
  assert.ok(await uploads.resolve(event.data.handoff_attachments![0].id));
});

test("再準備中に保留が変わったら保存せず、作成したファイルを片付ける", async () => {
  const { store, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "x" })));
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  store.events.add(chat.id, { type: "user", text: "長".repeat(20_001), message_uuid: "1" });
  const uploads = new UploadStore(tempDir());
  await prepareAndCommitProviderSwitch({ store, uploads: { save: async () => { throw new Error("失敗"); }, resolve: (id) => uploads.resolve(id), remove: (id) => uploads.remove(id) }, requireIdle: () => {}, git }, { chatId: chat.id, expectedProvider: "claude", target: "codex", queueWasPaused: false });
  const created: string[] = [];
  await assert.rejects(retryProviderHandoffPreparation({ store, uploads: { save: async (file) => { const saved = await uploads.save(file); created.push(saved.id); return saved; }, resolve: (id) => uploads.resolve(id), remove: (id) => uploads.remove(id) }, requireIdle: () => {}, git: async () => { store.chatProviderHandoffs.remove(chat.id); return git(); } }, chat.id), /状態が変わった/);
  assert.equal(await uploads.resolve(created[0]), undefined);
});
