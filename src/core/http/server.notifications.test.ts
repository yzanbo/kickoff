// API のテスト: 通知の判断（だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）と、見ているものの知らせ
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Approval } from "@shared/types";
import { hashToken } from "./caller.js";
import { setup } from "../testing/testServer.js";

const approval = (chatId: number, projectId: number, patch: Partial<Approval> = {}): Approval => ({
  id: `a${chatId}`,
  chat_id: chatId,
  project_id: projectId,
  kind: "permission",
  tool_name: "Bash",
  input: {},
  can_remember: true,
  created_at: new Date().toISOString(),
  ...patch,
});

function withChat() {
  const ctx = setup();
  const chat = ctx.store.chats.create({ project_id: ctx.project.id, provider: "claude", title: "調査", status: "running" });
  const finish = (status: "completed" | "failed" = "completed") => {
    ctx.store.chats.update(chat.id, { status: "running" });
    ctx.store.chats.update(chat.id, { status, ...(status === "failed" ? { error: "落ちました" } : {}) });
  };
  return { ...ctx, chat, finish };
}

test("通知: 作業中から終わった・失敗・回答待ち・CI の失敗を、この Mac の通知に出す（作業中のまま・終わったままの更新では出さない）", async () => {
  const { chat, finish, bus, project, notifyFake, store } = withChat();
  finish();
  finish("failed");
  store.chats.update(chat.id, { title: "調査 2" });
  bus.publish({ type: "approval", approval: approval(chat.id, project.id) });
  bus.publish({ type: "ci_failed", failure: { project_id: project.id, run_id: 9, workflow: "test", number: 3, branch: "main", title: "fix", url: "https://example.com" } });
  assert.deepEqual(
    notifyFake.notified.map((n) => [n.kind, n.title]),
    [
      ["completed", "✓ 完了: 調査"],
      ["failed", "✕ 失敗: 調査"],
      ["approval", "回答待ち: 調査 2"],
      ["ci_failed", "✕ CI が落ちました: main"],
    ],
  );
  assert.match(notifyFake.notified[1].body, /落ちました/);
  assert.deepEqual(notifyFake.notified[3].target, { kind: "ci", project_id: project.id, run_id: 9 });
});

test("通知: だれか（この Mac の画面・端末）が見ているチャット・CI のタブの知らせは出さない。見るのをやめたら出す", async () => {
  const { app, call, chat, finish, bus, project, notifyFake, store } = withChat();
  assert.equal((await call("PUT", "/api/viewing", { chat_id: chat.id, ci_project_id: project.id })).status, 204);
  finish();
  bus.publish({ type: "ci_failed", failure: { project_id: project.id, run_id: 1, workflow: "w", number: 1, branch: "b", title: "t", url: "u" } });
  assert.deepEqual(notifyFake.notified, []);
  await call("PUT", "/api/viewing", { chat_id: null, ci_project_id: null });

  // 端末が見ていても出さない（端末からも知らせられる）
  store.devices.create("Pixel", hashToken("d".repeat(40)));
  const put = await app.request("/api/viewing", { method: "PUT", headers: { authorization: `Bearer ${"d".repeat(40)}`, "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat.id, ci_project_id: null }) });
  assert.equal(put.status, 204);
  finish();
  assert.deepEqual(notifyFake.notified, []);
});

test("通知: 設定で Mac の通知を切ったら出さない。プッシュの宛先のある端末には、会話の中身を載せない短い文と本体の ID で送る", async () => {
  const { call, finish, store, notifyFake } = withChat();
  const pixel = store.devices.create("Pixel", hashToken("x".repeat(40)));
  store.devices.setPush(pixel.id, { kind: "expo", token: "ExponentPushToken[a]" });
  store.devices.create("宛先なし", hashToken("y".repeat(40)));
  await call("PUT", "/api/settings", { desktop_notifications: false });
  finish("failed");
  assert.deepEqual(notifyFake.notified, []);
  assert.deepEqual(notifyFake.pushed, [{ push: { kind: "expo", token: "ExponentPushToken[a]" }, title: "調査", body: "失敗しました", host_id: store.databaseId }]);
});

test("見ているものの知らせ: 形が違えば 400", async () => {
  const { call } = setup();
  assert.equal((await call("PUT", "/api/viewing", { chat_id: "1", ci_project_id: null })).status, 400);
  assert.equal((await call("PUT", "/api/viewing", {})).status, 400);
});
