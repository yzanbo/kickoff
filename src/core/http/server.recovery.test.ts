// API のテスト: 止まったあとの再開（通信の切断・使用枠の上限。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_AUTO_RESUMES, RESUME_PROMPT } from "../chat/recovery/reconnect.js";
import { USAGE_RESUME_PROMPT } from "../chat/recovery/usageLimit.js";
import { setup, until } from "../testing/testServer.js";

test("通信の切断: 送信待ちを送らずに止めて、つながったら自動で再開し、終わったら送信待ちを戻して送る", async () => {
  const { call, project, runner, provider, network, store } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "次" });
  // 作業中に通信が切れて失敗する
  provider.networkFailures = 1;
  network.online = false;
  release();
  await until(() => runner.reconnectState(chatId) !== null);
  assert.equal(store.chats.get(chatId)?.status, "failed");
  assert.equal(runner.queuePaused(chatId), true);
  assert.deepEqual(runner.queued(chatId).map((m) => m.text), ["次"]);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.reconnect, { attempts: 0, max: MAX_AUTO_RESUMES, agents: [] });
  assert.ok(store.events.list(chatId).some((e) => e.type === "notice" && /自動で再開します/.test(JSON.stringify(e.data))));
  // つながらない間は何も送らない（送信待ちも送らない）
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(provider.prompts, ["1"]);

  // つながったら「続けて」を送り、終わったら止めておいた送信待ちを戻して送る
  network.online = true;
  await until(() => provider.prompts.includes(RESUME_PROMPT));
  await until(() => provider.prompts.at(-1) === "次" && !runner.isBusy(chatId));
  assert.equal(runner.queuePaused(chatId), false);
  assert.equal(runner.reconnectState(chatId), null);
});

test("通信の切断: 通信で止まったサブエージェントは、自動で再開するときに名前と ID を添えて続きから再開を頼む（自分で止めたものは頼まない）", async () => {
  const { call, project, runner, provider, network, store } = setup();
  network.online = false;
  provider.networkFailures = 1;
  // 裏で動かした 2 件: 調査は通信で親ごと止まり、レビューは自分で止めた
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査", prompt: "調べて" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.\nagentId: a1", is_error: false },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
    { type: "tool_use", id: "tu2", name: "Agent", input: { description: "レビュー" } },
    { type: "tool_result", tool_use_id: "tu2", content: "Async agent launched successfully.\nagentId: a2", is_error: false },
    { type: "subagent", task_id: "a2", tool_use_id: "tu2", description: "レビュー", status: "stopped" },
  ];
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "1" })).body.id;
  await until(() => runner.reconnectState(chatId) !== null);
  provider.emits = [];
  // つながるのを待っている間は、続きから再開を頼むサブエージェントの名前も返す（画面の待っている行に添える）
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.reconnect.agents, ["調査"]);
  const events = store.events.list(chatId);
  // 実行の終わりの記録に通信の切断の印。お知らせには、止まったサブエージェントの名前を添える
  assert.ok(events.some((e) => e.type === "result" && (e.data as { network?: boolean }).network === true));
  assert.ok(events.some((e) => e.type === "notice" && /通信で止まったサブエージェント 1 件（調査）/.test(JSON.stringify(e.data))));
  // 作業の終わりとともに止まった、という（通信でないときの）お知らせは出さない
  assert.ok(!events.some((e) => e.type === "notice" && /作業の終わりとともに止まりました/.test(JSON.stringify(e.data))));

  network.online = true;
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  const resume = provider.prompts[1];
  assert.ok(resume.startsWith(RESUME_PROMPT));
  assert.match(resume, /「調査」（ID: a1）/);
  assert.doesNotMatch(resume, /a2/);
});

test("通信の切断: 続けて何度も止まったら、再開するかを聞き（回答待ち）、再開するで数え直して送る", async () => {
  const { call, project, runner, provider, network, approvals } = setup();
  network.online = true;
  // 最初の作業と、自動の再開の 3 回がすべて通信で失敗する
  provider.networkFailures = 1 + MAX_AUTO_RESUMES;
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "1" })).body.id;
  await until(() => approvals.list({ chatId }).length === 1);
  const [ask] = approvals.list({ chatId });
  assert.equal(ask.kind, "reconnect");
  assert.equal(provider.prompts.filter((p) => p === RESUME_PROMPT).length, MAX_AUTO_RESUMES);
  assert.equal(runner.reconnectState(chatId), null);

  // 再開する: すぐ「続けて」を送る（こんどは続く）
  assert.equal((await call("POST", `/api/approvals/${ask.id}`, { action: "allow" })).status, 200);
  await until(() => provider.prompts.filter((p) => p === RESUME_PROMPT).length === MAX_AUTO_RESUMES + 1 && !runner.isBusy(chatId));
  assert.equal(approvals.list({ chatId }).length, 0);
});

test("使用枠の上限: 送信待ちを止め、枠が戻ったら続けるかを聞く（勝手に再開しない）。続けるで再開し、終わったら送信待ちを戻す", async () => {
  const { call, project, runner, provider, approvals, store } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "次の指示" });
  // 枠が戻る時刻はもう過ぎている（すぐ聞く）
  provider.usageLimits = [new Date(Date.now() - 120_000).toISOString()];
  release();
  await until(() => approvals.list({ chatId }).length === 1);
  const [ask] = approvals.list({ chatId });
  assert.equal(ask.kind, "usage_limit");
  assert.match(ask.description ?? "", /送信待ちは、再開した作業が終わってから送ります/);
  // 聞いている間は何も送らず、送信待ちは止めてある
  assert.equal(provider.prompts.length, 1);
  assert.equal(runner.queuePaused(chatId), true);
  assert.ok(store.events.list(chatId).some((e) => e.type === "notice" && /使用枠の上限に達したため止まりました/.test(JSON.stringify(e.data))));

  // 続ける: 「続けて」を送り、終わったら送信待ちを戻して送る
  assert.equal((await call("POST", `/api/approvals/${ask.id}`, { action: "allow" })).status, 200);
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts.slice(1), [USAGE_RESUME_PROMPT, "次の指示"]);
  assert.equal(runner.queuePaused(chatId), false);
});

test("使用枠の上限: 戻る前は聞かず、その間に自分で送ったら聞くのをやめる。やめるを選んだら送信待ちは止めたまま", async () => {
  const { call, project, runner, provider, approvals } = setup();
  // 枠が戻るのはまだ先
  provider.usageLimits = [new Date(Date.now() + 3_600_000).toISOString()];
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "1" })).body.id;
  await until(() => !runner.isBusy(chatId));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(approvals.list({ chatId }).length, 0);
  // 自分で送った: 待つのをやめる（送ったものは普通に動く）
  await call("POST", `/api/chats/${chatId}/messages`, { text: "自分で続ける" });
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));

  // やめる: 送信待ちは止めたまま（自分で戻す）
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => provider.prompts.length === 3);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "あとで" });
  provider.usageLimits = [new Date(Date.now() - 120_000).toISOString()];
  release();
  await until(() => approvals.list({ chatId }).length === 1);
  await call("POST", `/api/approvals/${approvals.list({ chatId })[0].id}`, { action: "deny" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(provider.prompts.length, 3);
  assert.equal(runner.queuePaused(chatId), true);
  assert.deepEqual(runner.queued(chatId).map((m) => m.text), ["あとで"]);
});

test("通信の切断: 自動で再開しない設定・「自動で再開しない」・自分で送ったときは待たない", async () => {
  const { call, project, runner, provider, network, store } = setup();
  network.online = false;
  // 設定で切ると、止まったことだけを知らせて待たない
  await call("PUT", "/api/settings", { auto_resume_on_reconnect: false });
  provider.networkFailures = 1;
  const a = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "a" })).body.id;
  await until(() => store.chats.get(a)?.status === "failed");
  assert.equal(runner.reconnectState(a), null);
  assert.equal((await call("DELETE", `/api/chats/${a}/reconnect`)).status, 404);

  // 待っている間に「自動で再開しない」を押すと、つながっても送らない
  await call("PUT", "/api/settings", { auto_resume_on_reconnect: true });
  provider.networkFailures = 1;
  const b = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "b" })).body.id;
  await until(() => runner.reconnectState(b) !== null);
  assert.deepEqual((await call("DELETE", `/api/chats/${b}/reconnect`)).body, { ok: true });
  network.online = true;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.includes(RESUME_PROMPT), false);

  // 自分で送ったら、待つのをやめてそのまま送る
  network.online = false;
  provider.networkFailures = 1;
  const c = (await call("POST", `/api/projects/${project.id}/chats`, { prompt: "c" })).body.id;
  await until(() => runner.reconnectState(c) !== null);
  await call("POST", `/api/chats/${c}/messages`, { text: "自分で続き" });
  assert.equal(runner.reconnectState(c), null);
  await until(() => !runner.isBusy(c));
  network.online = true;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.includes(RESUME_PROMPT), false);
});
