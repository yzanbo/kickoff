// API のテスト: グループ（作る・並べ替える・名前を変える・消す。消すと中のチャットをグループなしに戻してから group_deleted を知らせる）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import { setup, until } from "@/app/core/testing/testServer";

test("グループ: 作る・並べ替える・名前を変える。名前は前後の空白を除き、空・ほかの形は 400、ないプロジェクト・グループは 404", async () => {
  const { call, api, project } = setup({ features: ["groups", "chat"] });
  const a = (await api("POST /api/projects/:projectId/groups", { params: { projectId: project.id }, body: { name: "  レビュー " } })).body;
  assert.equal(a.name, "レビュー");
  const b = (await api("POST /api/projects/:projectId/groups", { params: { projectId: project.id }, body: { name: "調べもの" } })).body;
  const listed = (await api("GET /api/projects/:projectId/groups", { params: { projectId: project.id } })).body;
  assert.deepEqual(listed.map((g) => g.id), [a.id, b.id]);
  const reordered = (await api("PUT /api/projects/:projectId/groups/order", { params: { projectId: project.id }, body: { ids: [b.id, a.id] } })).body;
  assert.deepEqual(reordered.map((g) => g.id), [b.id, a.id]);
  assert.equal((await api("PATCH /api/groups/:groupId", { params: { groupId: a.id }, body: { name: "確認" } })).body.name, "確認");

  assert.equal((await api("POST /api/projects/:projectId/groups", { params: { projectId: project.id }, body: { name: "  " } })).status, 400);
  assert.equal((await call("PUT", `/api/projects/${project.id}/groups/order`, { ids: ["x"] })).status, 400);
  assert.equal((await api("GET /api/projects/:projectId/groups", { params: { projectId: 999 } })).status, 404);
  assert.deepEqual(await api("PATCH /api/groups/:groupId", { params: { groupId: 999 }, body: { name: "x" } }), { status: 404, body: { error: "グループが見つかりません" } });
});

test("グループ: 消すと中のチャットをグループなしに戻し、そのあと group_deleted を知らせる", async () => {
  const { api, project, store, runner, bus } = setup({ features: ["groups", "chat"] });
  const group = (await api("POST /api/projects/:projectId/groups", { params: { projectId: project.id }, body: { name: "g" } })).body;
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "こんにちは", group_id: group.id } })).body.id;
  await until(() => !runner.isBusy(chatId));
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));

  assert.deepEqual(await api("DELETE /api/groups/:groupId", { params: { groupId: group.id } }), { status: 204, body: undefined });
  assert.equal(store.chats.get(chatId)?.group_id, null);
  const chatAt = events.findIndex((e) => e.type === "chat" && e.chat.id === chatId && e.chat.group_id === null);
  const deletedAt = events.findIndex((e) => e.type === "group_deleted" && e.id === group.id);
  assert.ok(chatAt >= 0 && deletedAt > chatAt, `チャットの知らせ（${chatAt}）が group_deleted（${deletedAt}）より先`);
  assert.equal((await api("GET /api/projects/:projectId/groups", { params: { projectId: project.id } })).body.length, 0);
});
