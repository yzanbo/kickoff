// API のテスト: 利用者が見ているもの（PUT /api/user-view と、送る指示に添えた送ったときの様子。AI の get_user_view。メモの仕様書「0019_AI の操作ツールの追加」の D）
import assert from "node:assert/strict";
import { test } from "node:test";
import { userViewSummaryOf } from "@shared/chat/aiUserView";
import type { UserView } from "@shared/types";
import { createAiUserViewTools } from "../chat/aiUserView.js";
import { until } from "../testing/testCore.js";
import { setup } from "../testing/testServer.js";
import { hashToken } from "./caller.js";

const DEVICE_TOKEN = "u".repeat(43);
const DEVICE = { authorization: `Bearer ${DEVICE_TOKEN}`, "content-type": "application/json" };

const viewOf = (projectId: number, path: string): UserView => ({
  project_id: projectId,
  panes: [{ area: "プロジェクトのファイル", tab: { kind: "editor", path, worktree: null, line: 3, selection: null } }],
  side: [],
});

test("見ているもの: この Mac の画面のウィンドウが知らせ、AI はそのチャットのウィンドウのいまの様子と、送ったときの様子を読む", async () => {
  const { call, store, project, runner, userViews } = setup();
  const chat = (await call("POST", `/api/projects/${project.id}/chats`, { text: "見て", user_view: viewOf(project.id, "sent.ts") })).body;
  await until(() => !runner.isBusy(chat.id));
  assert.equal((await call("PUT", "/api/user-view", { window_id: "w1", view: viewOf(project.id, "now.ts"), chat_ids: [chat.id], focused: true })).status, 204);
  const tools = createAiUserViewTools({ store, userViews }, chat.id);
  const text = tools.read();
  assert.equal(userViewSummaryOf(text), "画面を見ました（エディタ: now.ts）");
  assert.match(text, /エディタ: now\.ts カーソルは 3 行/);
  assert.match(text, /送ったとき.*の様子:\n- プロジェクトのファイル: エディタ: sent\.ts/);
  // 続きを送ると、送ったときの様子が変わる（送信待ち・止めずに伝えるも同じ）
  await call("POST", `/api/chats/${chat.id}/messages`, { text: "続き", user_view: viewOf(project.id, "second.ts") });
  await until(() => !runner.isBusy(chat.id));
  assert.match(tools.read(), /送ったとき.*の様子:\n- プロジェクトのファイル: エディタ: second\.ts/);
  await call("POST", `/api/chats/${chat.id}/queue`, { text: "あとで", user_view: viewOf(project.id, "queued.ts") });
  assert.match(tools.read(), /queued\.ts/);
  // ウィンドウを閉じたら、画面が開いていないと返す
  assert.equal((await call("PUT", "/api/user-view", { window_id: "w1", view: null, chat_ids: [], focused: false })).status, 204);
  assert.match(userViewSummaryOf(tools.read()) ?? "", /画面が開いていない/);
  // 形が違えば 400
  assert.equal((await call("PUT", "/api/user-view", { window_id: "w1", view: { project_id: 1, panes: [{ area: "x", tab: { kind: "nope" } }], side: [] }, chat_ids: [], focused: true })).status, 400);
});

test("見ているもの: スマホ（端末）は知らせられず、端末から送った指示の様子は覚えない", async () => {
  const { app, call, store, project, runner, userViews } = setup();
  store.settings.update({ remote_enabled: true });
  store.devices.create("Pixel", hashToken(DEVICE_TOKEN));
  const put = await app.request("/api/user-view", { method: "PUT", headers: DEVICE, body: JSON.stringify({ window_id: "phone", view: viewOf(project.id, "x.ts"), chat_ids: [], focused: true }) });
  assert.equal(put.status, 403);
  const chat = (await call("POST", `/api/projects/${project.id}/chats`, { text: "見て" })).body;
  await until(() => !runner.isBusy(chat.id));
  const sent = await app.request(`/api/chats/${chat.id}/messages`, { method: "POST", headers: DEVICE, body: JSON.stringify({ text: "スマホから", user_view: viewOf(project.id, "phone.ts") }) });
  assert.equal(sent.status, 200);
  await until(() => !runner.isBusy(chat.id));
  assert.equal(userViews.sentFor(chat.id), null);
});
