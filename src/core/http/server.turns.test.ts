// API のテスト: 作業中のチャット（未読・作業中の様子 live・裏の作業・圧縮・再試行・停止・止めずに伝える・作業の終わり・サブエージェントの報告の受け渡し）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, until } from "../testing/testServer.js";
import type { ChatLive, CompactingState } from "@shared/types";

test("未読: 作業中も AI の文章の返答で未読にし、一番下まで見た記録より新しい結果があれば既読にしない", async () => {
  const { call, project, store, runner, provider } = setup();
  // ツールの実行・サブエージェントの返答では未読にしない
  provider.emits = [
    { type: "tool_use", id: "t1", name: "Read", input: {} },
    { type: "text", text: "サブの返答", parent: "t1" },
  ];
  let release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "やって" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "running" && store.events.list(chatId).some((e) => e.type === "tool_use"));
  assert.equal(store.chats.get(chatId)?.unread, false);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`)).body.unread, false);

  // 作業中に AI の文章の返答が届いたら未読（作業中のまま）
  provider.emits = [{ type: "text", text: "途中の返答" }];
  release = provider.hold();
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "続けて" })).status, 200);
  await until(() => store.chats.get(chatId)?.unread === true);
  assert.equal(store.chats.get(chatId)?.status, "running");
  const textId = store.events.list(chatId).findLast((e) => e.type === "text")!.id;
  // 一番下まで見た（その返答まで）: 既読
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: textId })).body.unread, false);
  release();
  await until(() => !runner.isBusy(chatId));
  // 終わった: 未読。終わりの結果より前までしか見ていなければ未読のまま、終わりまで見たら既読
  assert.equal(store.chats.get(chatId)?.unread, true);
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: textId })).body.unread, true);
  const lastId = store.events.list(chatId).at(-1)!.id;
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: lastId })).body.unread, false);
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: "x" })).status, 400);
});

test("裏で動いている作業: 作業中はチャットの詳細で返し、SSE の chat_live でも知らせ、作業が終わったら消す", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: unknown[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.background);
  });
  const state = { tasks: [{ task_id: "b1", kind: "command" as const, description: "npm run dev" }], replied: true };
  provider.background = state;
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "動かして" })).body.id;
  await until(() => runner.live(chatId).background !== null);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live.background, state);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.background, null);
  assert.deepEqual(seen, [state, null]);
});

test("圧縮: 圧縮している間はチャットの詳細で始めた時刻ときっかけ（ふつうの指示の途中なら自動）を返し、SSE の chat_live でも知らせ、作業が終わったら消す", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: (CompactingState | null)[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.compacting);
  });
  provider.compacting = true;
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "続けて" })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  const compacting: CompactingState = (await call("GET", `/api/chats/${chatId}`)).body.live.compacting;
  assert.equal(typeof compacting.since, "string");
  assert.equal(compacting.trigger, "auto");
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.compacting, null);
  assert.deepEqual(seen, [compacting, null]);
});

test("圧縮の予約: 作業中の POST /compact は予約（compact_next）にし、DELETE /compact でやめる", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "続けて" })).body.id;
  await until(() => runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/compact`)).status, 200);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.compact_next, true);
  assert.equal((await call("DELETE", `/api/chats/${chatId}/compact`)).status, 204);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.compact_next, false);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("作業中の様子: チャットの詳細の live と SSE の chat_live は同じ形で、どれかが変わったときだけ丸ごと届く", async () => {
  const { call, project, runner, provider, bus } = setup();
  const lives: ChatLive[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") lives.push(JSON.parse(JSON.stringify(e.live)));
  });
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "次" });
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  // 変わらなければ知らせない
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  assert.equal(lives.length, 2);
  const last = lives.at(-1)!;
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live, last);
  assert.deepEqual(
    last.queue.messages.map((m) => m.text),
    ["次"],
  );
  assert.deepEqual(
    { ...last, queue: { ...last.queue, messages: [] } },
    { queue: { messages: [], paused: true, stops: [], waiting_edit: false }, background: null, retry: null, reconnect: null, compacting: null, stopping: false, compact_next: false },
  );
  await call("DELETE", `/api/chats/${chatId}/queue`);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("再試行: AI の API への通信を再試行している間はチャットの詳細でも返し、作業が終わったら消す", async () => {
  const { call, project, runner, provider } = setup();
  const retry = { attempt: 2, max_retries: 10, retry_delay_ms: 4000, at: new Date().toISOString() };
  provider.retry = retry;
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "動かして" })).body.id;
  await until(() => runner.live(chatId).retry !== null);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live.retry, retry);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.retry, null);
});

test("停止: 止めるよう頼んでから作業が終わるまでは、詳細と SSE の chat_live で停止中を知らせる", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: boolean[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.stopping);
  });
  provider.hold();
  let finish = () => {};
  provider.slowStop = new Promise((resolve) => (finish = resolve));
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "動かして" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.stopping, false);
  // 止めるよう頼んだだけで返すものはない（停止中は SSE の chat_live で届く）
  assert.deepEqual(await call("POST", `/api/chats/${chatId}/cancel`), { status: 204, body: undefined });
  // 2 回押しても知らせは 1 回
  await call("POST", `/api/chats/${chatId}/cancel`);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.stopping, true);
  assert.equal(runner.isBusy(chatId), true);
  finish();
  await until(() => !runner.isBusy(chatId));
  const detail = (await call("GET", `/api/chats/${chatId}`)).body;
  assert.equal(detail.live.stopping, false);
  assert.equal(detail.chat.status, "cancelled");
  assert.deepEqual(seen, [true, false]);
});

test("作業の終わり: 終わりの知らせがないまま止まったサブエージェントは、通信以外ならお知らせを残す", async () => {
  const { call, project, provider, store } = setup();
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.", is_error: false },
  ];
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  assert.ok(store.events.list(chatId).some((e) => e.type === "notice" && /サブエージェント 1 件（調査）/.test(JSON.stringify(e.data))));
  // 次の実行では、前の実行のものを数え直さない
  provider.emits = [];
  await call("POST", `/api/chats/${chatId}/messages`, { text: "次" });
  await until(() => store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  assert.equal(store.events.list(chatId).filter((e) => e.type === "notice" && /作業の終わりとともに/.test(JSON.stringify(e.data))).length, 1);
});

test("届かなかったサブエージェントの報告: 次に送る指示に本文を添えて渡し、自分の発言に印を残す（渡したら次からは添えない）", async () => {
  const { call, project, provider, store } = setup();
  // 裏で動かしたサブエージェントが報告を送ったが、親が動かないまま作業が終わった
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.\nagentId: a1", is_error: false },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "見つけたのは 3 件" },
  ];
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  provider.emits = [];
  await call("POST", `/api/chats/${chatId}/messages`, { text: "次" });
  await until(() => provider.prompts.length === 2);
  assert.ok(provider.prompts[1].startsWith("次\n"));
  assert.match(provider.prompts[1], /「調査」（ID: a1）の報告 ---\n見つけたのは 3 件/);
  const user = store.events.list(chatId).filter((e) => e.type === "user").at(-1)!;
  // 記録の自分の発言は、書いた文のまま（報告は印だけ）
  const { message_uuid: _id, ...userData } = user.data as { message_uuid?: string };
  assert.deepEqual(userData, { text: "次", handover: ["tu1"] });
  await until(() => store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  await call("POST", `/api/chats/${chatId}/messages`, { text: "その次" });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "その次");
});

test("止めずに伝える API: 作業中なら止めずに足して自分の発言に残し、足せなければ待ちの列へ。作業中でなければすぐ送る", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 作業中: 止めずに足す（待ちの列には入れない。作業も止めない）
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "ついでに" })).body, { result: "told" });
  assert.deepEqual(provider.told, ["ついでに"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  assert.equal(runner.isBusy(chatId), true);
  assert.equal((store.events.list(chatId).findLast((e) => e.type === "user")?.data as { text?: string }).text, "ついでに");
  assert.equal((await call("POST", `/api/chats/${chatId}/tell`, {})).status, 400);
  // 足せない（入力が閉じている）ときは待ちの列へ。行の「すぐ送る」で伝え直すときは先頭に戻す
  provider.acceptTell = false;
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "あとで" })).body, { result: "queued" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "2 番目" });
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["あとで", "2 番目"]);
  await call("POST", `/api/chats/${chatId}/queue/${runner.live(chatId).queue.messages[1].id}/send`);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["2 番目", "あとで"]);
  provider.acceptTell = true;
  await call("POST", `/api/chats/${chatId}/queue/${runner.live(chatId).queue.messages[1].id}/send`);
  assert.deepEqual(provider.told, ["ついでに", "あとで"]);
  // 裏の作業を 1 つ止める
  assert.equal((await call("POST", `/api/chats/${chatId}/background/b1/stop`)).status, 204);
  assert.deepEqual(provider.stoppedTasks, ["b1"]);
  await call("DELETE", `/api/chats/${chatId}/queue`);
  release();
  await until(() => !runner.isBusy(chatId));
  // 作業中でなければ 409（状態による失敗）
  assert.equal((await call("POST", `/api/chats/${chatId}/background/b1/stop`)).status, 409);
  // 作業中でなければ、すぐ送る
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "ふつう" })).body, { result: "sent" });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "ふつう");
});
