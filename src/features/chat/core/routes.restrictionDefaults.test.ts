import assert from "node:assert/strict";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";

test("制限の既定を API で保存し、新しいチャットにだけ適用する", async () => {
  const { call, api, project, runner } = setup({ features: ["chat", "childChats", "settings"] });
  const defaults = (await call("GET", "/api/settings")).body;
  assert.equal(defaults.sandbox_enabled_by_default, true);
  assert.equal(defaults.edit_scope_enabled_by_default, true);
  assert.equal((await call("PUT", "/api/settings", { sandbox_enabled_by_default: "false" })).status, 400);
  const saved = await call("PUT", "/api/settings", { sandbox_enabled_by_default: false, edit_scope_enabled_by_default: false });
  assert.equal(saved.body.sandbox_enabled_by_default, false);
  assert.equal(saved.body.edit_scope_enabled_by_default, false);
  const first = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "一つ目" } });
  assert.equal(first.status, 201);
  await until(() => !runner.isBusy(first.body.id));
  assert.equal(first.body.sandbox_enabled, false);
  assert.equal(first.body.edit_scope_enabled, false);
  await call("PUT", "/api/settings", { sandbox_enabled_by_default: true, edit_scope_enabled_by_default: true });
  const existing = (await api("GET /api/chats/:chatId", { params: { chatId: first.body.id } })).body.chat;
  assert.equal(existing.sandbox_enabled, false);
  assert.equal(existing.edit_scope_enabled, false);
  const second = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "二つ目" } });
  assert.equal(second.status, 201);
  await until(() => !runner.isBusy(second.body.id));
  assert.equal(second.body.sandbox_enabled, true);
  assert.equal(second.body.edit_scope_enabled, true);
});

test("分岐は現在のアプリ既定ではなく元のチャットの制限を引き継ぐ", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings"] });
  await call("PUT", "/api/settings", { sandbox_enabled_by_default: false, edit_scope_enabled_by_default: false });
  const started = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "分岐元" } });
  await until(() => store.chats.get(started.body.id)?.status === "completed");
  const result = store.events.list(started.body.id).find((e) => e.type === "result")!;
  await call("PUT", "/api/settings", { sandbox_enabled_by_default: true, edit_scope_enabled_by_default: true });
  const forked = await api("POST /api/chats/:chatId/fork", { params: { chatId: started.body.id }, body: { event_id: result.id } });
  assert.equal(forked.status, 201);
  assert.equal(forked.body.sandbox_enabled, false);
  assert.equal(forked.body.edit_scope_enabled, false);
});
