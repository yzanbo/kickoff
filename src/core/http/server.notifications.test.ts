// API のテスト: 通知の判断（だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）と、見ているものの知らせ
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Approval } from "@shared/types";
import { hashToken } from "./caller.js";
import { createAiNotifyTools } from "../chat/aiNotify.js";
import { until } from "../testing/testCore.js";
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
  // 端末から見ているものを知らせるテストのため、スマホ連携をオンにする
  ctx.store.settings.update({ remote_enabled: true });
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

test("通知: 見ている人には送らず、見ていない人にだけ送る（この Mac で見ていれば Mac の通知は出さず、見ていない端末にはプッシュ。端末で見ていれば、その端末には送らない）", async () => {
  const { app, call, chat, finish, bus, project, notifyFake, store } = withChat();
  const token = "d".repeat(40);
  const pixel = store.devices.create("Pixel", hashToken(token));
  store.devices.setPush(pixel.id, { kind: "expo", token: "ExponentPushToken[p]" });
  // この Mac で見ている: Mac の通知は出さず、見ていない端末にはプッシュ
  assert.equal((await call("PUT", "/api/viewing", { chat_id: chat.id, ci_project_id: project.id })).status, 204);
  finish();
  bus.publish({ type: "ci_failed", failure: { project_id: project.id, run_id: 1, workflow: "w", number: 1, branch: "b", title: "t", url: "u" } });
  assert.equal(notifyFake.notified.length, 0);
  assert.deepEqual(notifyFake.pushed.map((p) => p.body), ["終わりました"]);
  await call("PUT", "/api/viewing", { chat_id: null, ci_project_id: null });

  // 端末で見ている: その端末には送らず、この Mac には出す
  const put = await app.request("/api/viewing", { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat.id, ci_project_id: null }) });
  assert.equal(put.status, 204);
  finish();
  assert.deepEqual(notifyFake.notified.map((n) => n.kind), ["completed"]);
  assert.equal(notifyFake.pushed.length, 1);
});

test("通知: CI の失敗はこの Mac だけ（CI のタブは端末に開いていないので、プッシュには送らない）", async () => {
  const { bus, project, notifyFake, store } = withChat();
  const pixel = store.devices.create("Pixel", hashToken("z".repeat(40)));
  store.devices.setPush(pixel.id, { kind: "expo", token: "ExponentPushToken[q]" });
  bus.publish({ type: "ci_failed", failure: { project_id: project.id, run_id: 2, workflow: "w", number: 1, branch: "b", title: "t", url: "u" } });
  assert.deepEqual(notifyFake.notified.map((n) => n.kind), ["ci_failed"]);
  assert.deepEqual(notifyFake.pushed, []);
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

test("通知: Expo が「宛先がもう使えない」と答えたら、その端末のプッシュの宛先を外す（次からは送らない）", async () => {
  const { finish, store, notifyFake } = withChat();
  const pixel = store.devices.create("Pixel", hashToken("x".repeat(40)));
  store.devices.setPush(pixel.id, { kind: "expo", token: "ExponentPushToken[gone]" });
  notifyFake.result = "gone";
  finish("completed");
  await until(() => store.devices.push(pixel.id) === null);
  assert.equal(store.devices.get(pixel.id)!.has_push, false);
});

test("見ているものの知らせ: 形が違えば 400", async () => {
  const { call } = setup();
  assert.equal((await call("PUT", "/api/viewing", { chat_id: "1", ci_project_id: null })).status, 400);
  assert.equal((await call("PUT", "/api/viewing", {})).status, 400);
});

test("AI からの知らせ（notify_user）: 見ていなければ Mac の通知に本文を出し、スマホのプッシュには本文を載せない。流れに記録を残し、1 回の作業で 3 回まで", async () => {
  const { chat, bus, store, notifyFake, call } = withChat();
  const token = "e".repeat(40);
  const pixel = store.devices.create("Pixel", hashToken(token));
  store.devices.setPush(pixel.id, { kind: "expo", token: "ExponentPushToken[q]" });
  const tools = createAiNotifyTools({ store, publish: (e) => bus.publish(e) }, chat.id);
  assert.match(tools.notify({ message: "  移行の 1 段目が済みました  " }), /あと 2 回/);
  assert.deepEqual(
    notifyFake.notified.map((n) => [n.kind, n.title, n.body]),
    [["ai_notice", "AI からの知らせ: 調査", "p ・ 移行の 1 段目が済みました"]],
  );
  await until(() => notifyFake.pushed.length === 1);
  assert.deepEqual([notifyFake.pushed[0].title, notifyFake.pushed[0].body], ["調査", "AI からの知らせ"]);
  const notices = store.events.list(chat.id).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
  assert.deepEqual(notices, ["AI からの知らせ: 移行の 1 段目が済みました"]);
  // この Mac でそのチャットを見ていれば、Mac の通知は出さない
  assert.equal((await call("PUT", "/api/viewing", { chat_id: chat.id, ci_project_id: null })).status, 204);
  tools.notify({ message: "2 回目" });
  assert.equal(notifyFake.notified.length, 1);
  tools.notify({ message: "3 回目" });
  assert.throws(() => tools.notify({ message: "4 回目" }), /3 回まで/);
  assert.throws(() => tools.notify({ message: "あ".repeat(121) }), /120 文字まで/);
  assert.throws(() => tools.notify({ message: "  " }), /空です/);
  // 次の作業（作り直したツール）ではまた送れる
  assert.match(createAiNotifyTools({ store, publish: (e) => bus.publish(e) }, chat.id).notify({ message: "次の作業" }), /あと 2 回/);
});
