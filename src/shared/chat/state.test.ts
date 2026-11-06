import assert from "node:assert/strict";
import { test } from "node:test";
import { agentStateOf, boardColumnOf } from "./state";
import { Store } from "../../core/db/store.js";

function mk() {
  const store = new Store(":memory:");
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "running", model: null });
  return { store, chat };
}

test("エージェントの状態は 回答待ち → エラー → 作業中 → 未読 → 既読 の優先順で決まる（失敗も見たら既読）", () => {
  const { store, chat } = mk();
  assert.equal(agentStateOf(chat, true), "needs_input");
  assert.equal(agentStateOf(chat, false), "running");
  assert.equal(agentStateOf(store.chats.update(chat.id, { status: "failed", unread: true }), false), "failed");
  assert.equal(agentStateOf(store.chats.update(chat.id, { status: "failed", unread: false }), false), "read");
  assert.equal(agentStateOf(store.chats.update(chat.id, { status: "completed", unread: true }), false), "unread");
  assert.equal(agentStateOf(store.chats.update(chat.id, { unread: false }), false), "read");
});

test("カンバンの列は AI の状態だけで決まる（作業中 → 回答待ち → 未読（失敗も）→ 既読）", () => {
  const { store, chat } = mk();
  assert.equal(boardColumnOf(agentStateOf(chat, false)), "running");
  assert.equal(boardColumnOf(agentStateOf(chat, true)), "needs_input");
  assert.equal(boardColumnOf(agentStateOf(store.chats.update(chat.id, { status: "completed", unread: true }), false)), "unread");
  assert.equal(boardColumnOf(agentStateOf(store.chats.update(chat.id, { status: "failed", unread: true }), false)), "unread");
  assert.equal(boardColumnOf(agentStateOf(store.chats.update(chat.id, { status: "completed", unread: false }), false)), "read");
  assert.equal(boardColumnOf(agentStateOf(store.chats.update(chat.id, { status: "failed", unread: false }), false)), "read");
});

test("アーカイブしたチャットは一覧に出ず、削除すると会話の記録も消える", () => {
  const { store, chat } = mk();
  store.events.add(chat.id, { type: "user", text: "x" , message_uuid: "u7" });
  store.chats.archive(chat.id, true);
  assert.equal(store.chats.list().length, 0);
  assert.equal(store.chats.list({ includeArchived: true }).length, 1);
  store.chats.delete(chat.id);
  assert.equal(store.chats.get(chat.id), undefined);
  assert.equal(store.events.list(chat.id).length, 0);
});

test("新しいチャットは、推論の深さを決めていなければ指定しない（null のまま）。使わなくなった列は返さない", () => {
  const { chat } = mk();
  assert.deepEqual({ effort: chat.effort, permission_mode: chat.permission_mode }, { effort: null, permission_mode: "default" });
  for (const key of ["phase", "task_id", "stage"]) assert.equal(key in chat, false, key);
});
