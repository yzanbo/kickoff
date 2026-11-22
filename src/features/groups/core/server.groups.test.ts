// API のテスト: グループ（作る・並べ替える・名前を変える・消す。消すと中のチャットをグループなしに戻してから group_deleted を知らせる）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import type { ChatGroup } from "@shared/groups/types";
import { setup, until } from "@/app/core/testing/testServer";

test("グループ: 作る・並べ替える・名前を変える。名前は前後の空白を除き、空・ほかの形は 400、ないプロジェクト・グループは 404", async () => {
  const { call, project } = setup();
  const a = (await call("POST", `/api/projects/${project.id}/groups`, { name: "  レビュー " })).body as ChatGroup;
  assert.equal(a.name, "レビュー");
  const b = (await call("POST", `/api/projects/${project.id}/groups`, { name: "調べもの" })).body as ChatGroup;
  const listed = (await call("GET", `/api/projects/${project.id}/groups`)).body as ChatGroup[];
  assert.deepEqual(listed.map((g) => g.id), [a.id, b.id]);
  const reordered = (await call("PUT", `/api/projects/${project.id}/groups/order`, { ids: [b.id, a.id] })).body as ChatGroup[];
  assert.deepEqual(reordered.map((g) => g.id), [b.id, a.id]);
  assert.equal((await call("PATCH", `/api/groups/${a.id}`, { name: "確認" })).body.name, "確認");

  assert.equal((await call("POST", `/api/projects/${project.id}/groups`, { name: "  " })).status, 400);
  assert.equal((await call("PUT", `/api/projects/${project.id}/groups/order`, { ids: ["x"] })).status, 400);
  assert.equal((await call("GET", "/api/projects/999/groups")).status, 404);
  assert.deepEqual(await call("PATCH", "/api/groups/999", { name: "x" }), { status: 404, body: { error: "グループが見つかりません" } });
});

test("グループ: 消すと中のチャットをグループなしに戻し、そのあと group_deleted を知らせる", async () => {
  const { call, project, store, runner, bus } = setup();
  const group = (await call("POST", `/api/projects/${project.id}/groups`, { name: "g" })).body as ChatGroup;
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "こんにちは", group_id: group.id })).body.id;
  await until(() => !runner.isBusy(chatId));
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));

  assert.deepEqual(await call("DELETE", `/api/groups/${group.id}`), { status: 204, body: undefined });
  assert.equal(store.chats.get(chatId)?.group_id, null);
  const chatAt = events.findIndex((e) => e.type === "chat" && e.chat.id === chatId && e.chat.group_id === null);
  const deletedAt = events.findIndex((e) => e.type === "group_deleted" && e.id === group.id);
  assert.ok(chatAt >= 0 && deletedAt > chatAt, `チャットの知らせ（${chatAt}）が group_deleted（${deletedAt}）より先`);
  assert.equal((await call("GET", `/api/projects/${project.id}/groups`)).body.length, 0);
});
