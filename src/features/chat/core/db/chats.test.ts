import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";

function mk() {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "running", model: null });
  return { store, chat };
}

test("アーカイブしたチャットは一覧に出ず、削除すると会話の記録も消える", () => {
  const { store, chat } = mk();
  store.events.add(chat.id, { type: "user", text: "x", message_uuid: "u7" });
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
