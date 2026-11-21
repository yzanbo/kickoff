// チャットを変える口（PATCH /api/chats/:id）の決まり: 名前・固定・グループ・アーカイブ（AI の update_chat・archive_chat と同じ決まり）
import assert from "node:assert/strict";
import { test } from "vitest";
import { setup } from "@/app/core/testing/testServer";

test("PATCH /api/chats/:id: 子チャットはグループに入れられない（400。グループは変わらない）。親のないチャットは入れられる", async () => {
  const { call, project, store } = setup();
  const group = (await call("POST", `/api/projects/${project.id}/groups`, { name: "g" })).body;
  const parent = store.chats.create({ project_id: project.id, provider: "claude", title: "親", status: "completed" });
  const child = store.chats.create({ project_id: project.id, provider: "claude", title: "子", status: "completed", parent_chat_id: parent.id });
  const refused = await call("PATCH", `/api/chats/${child.id}`, { group_id: group.id, title: "変えない" });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /子チャットはグループに入りません/);
  assert.deepEqual([store.chats.get(child.id)?.group_id, store.chats.get(child.id)?.title], [null, "子"]);
  assert.equal((await call("PATCH", `/api/chats/${child.id}`, { group_id: null })).status, 200);
  assert.equal((await call("PATCH", `/api/chats/${parent.id}`, { group_id: group.id })).body.group_id, group.id);
});
