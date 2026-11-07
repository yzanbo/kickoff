// API のテスト: 作業中のチャット（未読・作業中の様子 live・裏の作業・圧縮・再試行・停止・止めずに伝える・作業の終わり・サブエージェントの報告の受け渡し）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, until } from "../testing/testServer.js";
import type { ChatLive, CompactingState } from "@shared/types";
import { autoPreCompactMessage, busyPreCompactMessage, manualPreCompactMessage, postCompactMessage } from "@shared/chat/prompts";

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

test("圧縮の直後: 作業の終わりを待たずに、要約したあとのコンテキストの大きさをチャットに書いて SSE で知らせる", async () => {
  const { call, project, store, runner, provider, bus } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "はじめ" })).body.id;
  await until(() => !runner.isBusy(chatId));
  store.chats.update(chatId, { context_tokens: 180_000, context_window: 200_000 });
  const seen: (number | null)[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat" && e.chat.id === chatId) seen.push(e.chat.context_tokens);
  });
  provider.contextTokens = 30_000;
  const release = provider.hold();
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "続けて" })).status, 200);
  // 作業中のまま、メーターの値が要約したあとの大きさになる
  await until(() => store.chats.get(chatId)?.context_tokens === 30_000);
  assert.equal(store.chats.get(chatId)?.status, "running");
  assert.ok(seen.includes(30_000));
  release();
  await until(() => !runner.isBusy(chatId));
});

test("圧縮の予約: 作業中の POST /compact は送信待ちのいちばん上に圧縮の行を入れ、行を消せばやめられる", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "続けて" })).body.id;
  await until(() => runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/compact`)).status, 200);
  const queued = (await call("GET", `/api/chats/${chatId}`)).body.live.queue.messages as { id: string; compact?: boolean }[];
  assert.equal(queued.length, 1);
  assert.equal(queued[0].compact, true);
  assert.equal((await call("DELETE", `/api/chats/${chatId}/queue/${queued[0].id}`)).body.messages.length, 0);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal(provider.prompts.length, 1);
});

test("手でコンテキストを消去（POST /clear）: 作業していなければその場で消去して区切りを残し、作業中なら終わったらすぐ消去する予約（行を消せばやめられる）。会話がなければ 409", async () => {
  const { call, project, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => !runner.isBusy(chatId));
  const cleared = await call("POST", `/api/chats/${chatId}/clear`);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.session_id, null);
  const detail = (await call("GET", `/api/chats/${chatId}`)).body;
  assert.equal(detail.events.at(-1).type, "context_cleared");
  assert.equal((await call("POST", `/api/chats/${chatId}/clear`)).status, 409);
  // 作業中: 送信待ちのいちばん上に消去の行を入れる
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => runner.isBusy(chatId));
  await call("POST", `/api/chats/${chatId}/queue`, { text: "3" });
  assert.equal((await call("POST", `/api/chats/${chatId}/clear`)).status, 200);
  const queued = (await call("GET", `/api/chats/${chatId}`)).body.live.queue.messages as { id: string; text: string; clear?: boolean }[];
  assert.deepEqual(queued.map((m) => (m.clear ? "消去" : m.text)), ["消去", "3"]);
  // 終わったら消去してから 3 を送る
  release();
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");
  const types = ((await call("GET", `/api/chats/${chatId}`)).body.events as { type: string }[]).map((e) => e.type);
  assert.equal(types.filter((t) => t === "context_cleared").length, 2);
  await until(() => !runner.isBusy(chatId));
});

test("圧縮前指示: 手で圧縮すると、先に共通 → プロジェクトの指示を札付きの発言として送り、その作業が終わってから /compact を送る", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "はじめ" })).body.id;
  await until(() => !runner.isBusy(chatId));
  await call("PUT", "/api/settings", { pre_compact_prompt: " 共通の指示 " });
  await call("PATCH", `/api/projects/${project.id}`, { pre_compact_prompt: "プロジェクトの指示" });
  const release = provider.hold();
  assert.equal((await call("POST", `/api/chats/${chatId}/compact`)).status, 200);
  await until(() => provider.prompts.length === 2);
  const text = "共通の指示\n\nプロジェクトの指示";
  assert.equal(provider.prompts[1], manualPreCompactMessage(text));
  const user = store.events.list(chatId).findLast((e) => e.type === "user")!;
  assert.ok(user.type === "user");
  assert.deepEqual([user.data.text, user.data.pre_compact, user.data.message_uuid], [text, true, provider.promptIds[1]]);
  // 指示の作業の途中で自動の圧縮が来ても、もう足さない
  assert.equal(provider.preCompacts[1], null);
  release();
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[2], "/compact");

  // 指示の作業を止めたら圧縮しない
  const release2 = provider.hold();
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => provider.prompts.length === 4);
  await call("POST", `/api/chats/${chatId}/cancel`);
  await until(() => !runner.isBusy(chatId));
  release2();
  assert.equal(provider.prompts.length, 4);

  // オフにした分は、文が残っていても送らない（残りのオンの分だけ）
  await call("PUT", "/api/settings", { pre_compact_enabled: false });
  const release3 = provider.hold();
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => provider.prompts.length === 5);
  assert.equal(provider.prompts[4], manualPreCompactMessage("プロジェクトの指示"));
  release3();
  await until(() => provider.prompts.length === 6 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[5], "/compact");

  // すべてオフ・指示がなければすぐ /compact
  await call("PATCH", `/api/projects/${project.id}`, { pre_compact_enabled: false });
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => provider.prompts.length === 7 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[6], "/compact");
  await call("PUT", "/api/settings", { pre_compact_prompt: null, pre_compact_enabled: true });
  await call("PATCH", `/api/projects/${project.id}`, { pre_compact_prompt: null, pre_compact_enabled: true });
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => provider.prompts.length === 8 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[7], "/compact");
});

test("圧縮前指示: 自動の圧縮の前に足す指示は、コンテキストウィンドウが分かってから渡し、足したら記録して、圧縮するまで渡さない", async () => {
  const { call, project, store, runner, provider } = setup();
  await call("PUT", "/api/settings", { pre_compact_prompt: "メモを書いて" });
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "はじめ" })).body.id;
  await until(() => !runner.isBusy(chatId));
  // 最初の作業はウィンドウが分からない
  assert.equal(provider.preCompacts[0], null);
  store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
  provider.preCompactSentId = "pc-1";
  await call("POST", `/api/chats/${chatId}/messages`, { text: "続けて" });
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual(provider.preCompacts[1], { message: autoPreCompactMessage("メモを書いて"), contextWindow: 200_000, contextTokens: 120_000 });
  const user = store.events.list(chatId).find((e) => e.type === "user" && e.data.pre_compact)!;
  assert.ok(user.type === "user");
  assert.deepEqual([user.data.text, user.data.message_uuid], ["メモを書いて", "pc-1"]);
  // 作業の区切りまで圧縮が来なかったので、続けて圧縮した（その実行には足さない）
  assert.equal(provider.prompts[2], "/compact");
  assert.equal(provider.preCompacts[2], null);
  // 送ったあとは、圧縮するまで渡さない
  store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
  await call("POST", `/api/chats/${chatId}/messages`, { text: "まだ" });
  await until(() => !runner.isBusy(chatId));
  assert.equal(provider.preCompacts[3], null);
});

test("圧縮前指示から圧縮が終わるまで: 「いま」は預かって圧縮のあとに送り、区切りまで圧縮が来なければ作業の終わりで続けて圧縮する", async () => {
  const { call, project, store, runner, provider, bus } = setup();
  const triggers: string[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live" && e.live.compacting && triggers.at(-1) !== e.live.compacting.trigger) triggers.push(e.live.compacting.trigger);
  });
  await call("PUT", "/api/settings", { pre_compact_prompt: "メモを書いて" });
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "はじめ" })).body.id;
  await until(() => !runner.isBusy(chatId));
  const users = () => store.events.list(chatId).flatMap((e) => (e.type === "user" ? [e.data.text] : []));

  // 自動の圧縮の前の指示を足したら、圧縮が終わるまで「いま」は足さずに預かる
  store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
  provider.preCompactSentId = "pc-1";
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "続けて" });
  await until(() => runner.live(chatId).awaiting_compact);
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "あ" })).body, { result: "held" });
  assert.deepEqual(provider.told, []);
  assert.deepEqual(runner.live(chatId).after_compact.map((m) => m.text), ["あ"]);
  // 指示の作業が区切りまで終わったら、ほかを送る前に自動の圧縮として続けて圧縮し、そのあとで預かった指示を送る
  provider.preCompactSentId = null;
  provider.compacting = true;
  release();
  await until(() => provider.prompts.at(-1) === "あ" && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts.slice(1), ["続けて", "/compact", "あ"]);
  assert.equal(triggers[0], "auto");
  assert.deepEqual(users(), ["はじめ", "続けて", "メモを書いて", "あ"]);
  assert.equal(runner.live(chatId).awaiting_compact, false);
  assert.deepEqual(runner.live(chatId).after_compact, []);
  provider.compacting = false;

  // 手で圧縮する前の指示の作業の間も預かり、圧縮の実行が終わってから送る（送信待ちを止めていても送る）
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  const release2 = provider.hold();
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => provider.prompts.length === 5);
  assert.ok(runner.live(chatId).awaiting_compact);
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "い" })).body, { result: "held" });
  release2();
  await until(() => provider.prompts.at(-1) === "い" && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts.slice(5), ["/compact", "い"]);
  assert.deepEqual(provider.told, []);

  // 指示の作業を止めたら圧縮せず、預かった指示はすぐ送る
  const release3 = provider.hold();
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => provider.prompts.length === 8);
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "う" })).body, { result: "held" });
  await call("POST", `/api/chats/${chatId}/cancel`);
  await until(() => provider.prompts.length === 9);
  assert.equal(provider.prompts[8], "う");
  release3();
  await until(() => !runner.isBusy(chatId));
  assert.equal(runner.live(chatId).awaiting_compact, false);
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
    { queue: { messages: [], paused: true, stops: [], waiting_edit: false }, background: null, retry: null, reconnect: null, compacting: null, stopping: false, after_compact: [], awaiting_compact: false, compact_after_turn: false, queue_resume: null },
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

test("圧縮中に止めずに伝える: 預かって作業中の様子に出し、圧縮が終わったら送った順に伝える。作業ごと終わったら送信待ちの先頭へ", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  provider.compacting = true;
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  // 圧縮中: 足さずに預かる（記録にも、送信待ちにも入れない）
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "あ" })).body, { result: "held" });
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "い" })).body, { result: "held" });
  assert.deepEqual(provider.told, []);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live.after_compact.map((m: { text: string }) => m.text), ["あ", "い"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  const users = () => store.events.list(chatId).filter((e) => e.type === "user").map((e) => (e.data as { text: string }).text);
  assert.deepEqual(users(), ["1"]);
  // 圧縮が終わったら、送った順に伝えて自分の発言に残す
  provider.finishCompacting();
  await until(() => provider.told.length === 2);
  assert.deepEqual(provider.told, ["あ", "い"]);
  assert.deepEqual(users(), ["1", "あ", "い"]);
  assert.deepEqual(runner.live(chatId).after_compact, []);
  release();
  await until(() => !runner.isBusy(chatId));

  // 圧縮中に作業ごと終わった（止めた）: 送信待ちの先頭に入れ、終わりの自動送信でほかより先に送る
  provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => runner.live(chatId).compacting !== null);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "前からの送信待ち" });
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "う" })).body, { result: "held" });
  provider.compacting = false;
  await call("POST", `/api/chats/${chatId}/cancel`);
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "う");
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["前からの送信待ち"]);
  assert.deepEqual(runner.live(chatId).after_compact, []);
  await call("DELETE", `/api/chats/${chatId}/queue`);
  await call("POST", `/api/chats/${chatId}/cancel`);
  await until(() => !runner.isBusy(chatId));

  // 手で圧縮した実行（圧縮のボタン）には足さず、圧縮の実行が終わってから送る
  const releaseCompact = provider.hold();
  provider.compacting = true;
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => runner.live(chatId).compacting !== null);
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "え" })).body, { result: "held" });
  // 圧縮が終わっても、圧縮の実行が終わるまでは預かったまま
  provider.finishCompacting();
  assert.deepEqual(runner.live(chatId).after_compact.map((m) => m.text), ["え"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  provider.compacting = false;
  releaseCompact();
  await until(() => provider.prompts.at(-1) === "え");
  assert.deepEqual(provider.told, ["あ", "い"]);
  await until(() => !runner.isBusy(chatId));
});

test("圧縮中に預かった「いま」は、送れない終わり方（通信の切断）で作業ごと終わったら、送信待ちの先頭に入れる（前からの送信待ちより先・送った順・出どころの印も残す）", async () => {
  const { call, project, runner, provider, network } = setup();
  const release = provider.hold();
  provider.compacting = true;
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "前からの送信待ち" });
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "う" })).body, { result: "held" });
  const from = { chat_id: 99, title: "子" };
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "え", handoff_from: from })).body, { result: "held" });
  network.online = false;
  provider.networkFailures = 1;
  provider.compacting = false;
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).after_compact.length === 0);
  const queued = runner.live(chatId).queue.messages;
  assert.deepEqual(queued.map((m) => m.text), ["う", "え", "前からの送信待ち"]);
  assert.deepEqual(queued[1].handoff_from, from);
  // 預かった指示は、まだ伝えていないので自分の発言には残さない
  assert.deepEqual(provider.told, []);
});

test("圧縮中に預かった指示は、伝える前なら送らずに消せる（消した指示を返し、もう伝えた・ない指示は 404）", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  provider.compacting = true;
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  await call("POST", `/api/chats/${chatId}/tell`, { text: "あ" });
  await call("POST", `/api/chats/${chatId}/tell`, { text: "い" });
  const [first] = runner.live(chatId).after_compact;
  const removed = await call("DELETE", `/api/chats/${chatId}/after-compact/${first!.id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.text, "あ");
  assert.deepEqual(runner.live(chatId).after_compact.map((m) => m.text), ["い"]);
  assert.equal((await call("DELETE", `/api/chats/${chatId}/after-compact/${first!.id}`)).status, 404);
  // 圧縮が終わったら、残した指示だけを伝える
  provider.finishCompacting();
  await until(() => provider.told.length === 1);
  assert.deepEqual(provider.told, ["い"]);
  assert.deepEqual(runner.live(chatId).after_compact, []);
  provider.compacting = false;
  release();
  await until(() => !runner.isBusy(chatId));
});

test("圧縮後指示: 圧縮が終わったら、預かった「いま」より先に札付きで伝え、手で圧縮したときは圧縮の実行のあとに新しい作業として送る", async () => {
  const { call, project, runner, provider, store } = setup();
  await call("PUT", "/api/settings", { post_compact_prompt: " 共通のあと " });
  await call("PATCH", `/api/projects/${project.id}`, { post_compact_prompt: "メモを読み直す" });
  const text = "共通のあと\n\nメモを読み直す";
  const users = () =>
    store.events
      .list(chatId)
      .filter((e) => e.type === "user")
      .map((e) => (e.type === "user" && e.data.post_compact ? `後:${e.data.text}` : (e.data as { text: string }).text));

  // 作業の途中の自動の圧縮: 圧縮中に送った「いま」は、圧縮後指示のあとに伝える（記録も圧縮の行の下に、圧縮後指示 → 預かった指示の順）
  const release = provider.hold();
  provider.compacting = true;
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "あ" })).body, { result: "held" });
  provider.compactBoundary();
  await until(() => provider.told.length === 2);
  assert.deepEqual(provider.told, [postCompactMessage(text), "あ"]);
  assert.deepEqual(users(), ["1", `後:${text}`, "あ"]);
  const types = store.events.list(chatId).map((e) => e.type).filter((t) => t === "compact" || t === "user");
  assert.deepEqual(types, ["user", "compact", "user", "user"]);
  assert.deepEqual(runner.live(chatId).after_compact, []);
  // 送り終えたら、「いま」はまた預からずにそのまま伝える
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "い" })).body, { result: "told" });
  provider.compacting = false;
  release();
  await until(() => !runner.isBusy(chatId));

  // 手で圧縮: 圧縮の実行には足さず、終わってから圧縮後指示を新しい作業として送り、預かった「いま」はその作業に伝える
  provider.emitCompactOnCompact = true;
  const releaseCompact = provider.hold();
  provider.compacting = true;
  await call("POST", `/api/chats/${chatId}/compact`);
  await until(() => runner.live(chatId).compacting !== null);
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "う" })).body, { result: "held" });
  assert.deepEqual(runner.live(chatId).after_compact.map((m) => [m.text, Boolean(m.post_compact)]), [[text, true], ["う", false]]);
  provider.compacting = false;
  releaseCompact();
  // 圧縮後指示の作業は止めておく（預かった「いま」がその作業に伝わるのを確かめる）
  const releasePost = provider.hold();
  await until(() => provider.prompts.at(-1) === postCompactMessage(text) && provider.told.at(-1) === "う");
  assert.deepEqual(users().slice(-2), [`後:${text}`, "う"]);
  releasePost();
  await until(() => !runner.isBusy(chatId));

  // 圧縮後指示がなければ、預かった「いま」だけを伝える（圧縮しなかった作業では送らない）
  await call("PUT", "/api/settings", { post_compact_prompt: null });
  await call("PATCH", `/api/projects/${project.id}`, { post_compact_prompt: null });
  const before = provider.prompts.length;
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(chatId));
  assert.equal(provider.prompts.length, before + 1);
  assert.ok(!users().slice(-1)[0].startsWith("後:"));
});

test("圧縮前指示・圧縮後指示は送信待ちに入れない: 作業中に手で圧縮すると、圧縮前指示をいまの作業に伝え、終わったら送信待ちより先に圧縮して圧縮後指示を送る", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "はじめ" })).body.id;
  await until(() => !runner.isBusy(chatId));
  await call("PUT", "/api/settings", { pre_compact_prompt: "メモを書いて", post_compact_prompt: "メモを読んで" });
  provider.emitCompactOnCompact = true;
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "作業" });
  await until(() => provider.prompts.length === 2);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "次" });
  assert.equal((await call("POST", `/api/chats/${chatId}/compact`)).status, 200);
  // 圧縮の行で予約せず、いまの作業にそのまま伝える（札付きの自分の発言）。圧縮が終わるまで「いま」は預かる
  assert.deepEqual(provider.told, [busyPreCompactMessage("メモを書いて")]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => (m.compact ? "圧縮" : m.text)), ["次"]);
  assert.equal(runner.live(chatId).awaiting_compact, true);
  // 画面が「いまの作業が終わったら圧縮します」を出せるよう、作業のあとで圧縮することを配る
  assert.equal(runner.live(chatId).compact_after_turn, true);
  const user = store.events.list(chatId).findLast((e) => e.type === "user")!;
  assert.ok(user.type === "user" && user.data.pre_compact && user.data.text === "メモを書いて");
  // もう伝えたので、もう一度押しても足さない（予約になる）
  await call("POST", `/api/chats/${chatId}/compact`);
  assert.equal(provider.told.length, 1);
  await call("DELETE", `/api/chats/${chatId}/queue/${runner.live(chatId).queue.messages.find((m) => m.compact)!.id}`);
  release();
  await until(() => provider.prompts.at(-1) === "次" && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts.slice(2), ["/compact", postCompactMessage("メモを読んで"), "次"]);
  assert.equal(runner.live(chatId).compact_after_turn, false);
  const compacted = store.events.list(chatId).find((e) => e.type === "compact");
  assert.ok(compacted?.type === "compact" && compacted.data.trigger === "manual");
});

test("圧縮後指示は送信待ちに入れない: いまの作業に足せなければ足せるまで待ち、作業が終わっていれば送信待ち（止めていても）より先に送る。送れない終わり方なら次に送った作業に伝える", async () => {
  const { call, project, runner, provider, network } = setup();
  await call("PUT", "/api/settings", { post_compact_prompt: "読み直す" });
  const post = postCompactMessage("読み直す");
  const queueTexts = () => runner.live(chatId).queue.messages.map((m) => m.text);

  // 足せるようになったら、いまの作業に伝える
  const release = provider.hold();
  provider.compacting = true;
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "次" });
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  provider.acceptTell = false;
  provider.compactBoundary();
  await until(() => runner.live(chatId).after_compact.length === 1);
  assert.deepEqual(queueTexts(), ["次"]);
  provider.acceptTell = true;
  await until(() => provider.told.includes(post));
  assert.deepEqual(runner.live(chatId).after_compact, []);

  // 足せないまま作業が終わったら、送信待ちより先に新しい作業として送る（止めている送信待ちは送らない）
  provider.acceptTell = false;
  provider.compactBoundary();
  await until(() => runner.live(chatId).after_compact.length === 1);
  provider.compacting = false;
  release();
  await until(() => provider.prompts.at(-1) === post && !runner.isBusy(chatId));
  assert.deepEqual(queueTexts(), ["次"]);

  // 通信の切断で終わったら、送信待ちに入れずに残し、次に送った作業にそのまま伝える
  const release2 = provider.hold();
  provider.compacting = true;
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => runner.live(chatId).compacting !== null);
  provider.compactBoundary();
  await until(() => runner.live(chatId).after_compact.length === 1);
  network.online = false;
  provider.networkFailures = 1;
  provider.compacting = false;
  release2();
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual(queueTexts(), ["次"]);
  assert.deepEqual(runner.live(chatId).after_compact.map((m) => m.post_compact), [true]);
  // 送信待ちを止めているので自動では再開しない。次に自分で送った作業に、そのまま伝える
  network.online = true;
  provider.acceptTell = true;
  const told = provider.told.length;
  const release3 = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "3" });
  await until(() => provider.told.length === told + 1);
  release3();
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual([provider.prompts.at(-1), provider.told.at(-1)], ["3", post]);
  assert.deepEqual(runner.live(chatId).after_compact, []);
  assert.deepEqual(queueTexts(), ["次"]);
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

test("発言の印（依頼文の頼み・子チャットから渡した依頼）は、送る・送信待ちに入れる・送信待ちから送るのどの道でも発言の記録に残る", async () => {
  const { call, project, runner, provider, store } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => !runner.isBusy(chatId));
  const users = () => store.events.list(chatId).filter((e) => e.type === "user").map((e) => (e.type === "user" ? [e.data.text, e.data.handoff_request ?? null, e.data.handoff_from?.chat_id ?? null] : []));
  // 送る
  await call("POST", `/api/chats/${chatId}/messages`, { text: "依頼文を", handoff_request: true });
  await until(() => !runner.isBusy(chatId));
  // 作業中に送信待ちへ入れ、終わったら送る（印は送信待ちの行に残り、送ったときの記録にも残る）
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => runner.isBusy(chatId));
  const queued = (await call("POST", `/api/chats/${chatId}/queue`, { text: "渡した依頼", handoff_from: { chat_id: 99, title: "子" } })).body;
  assert.deepEqual(queued.messages[0].handoff_from, { chat_id: 99, title: "子" });
  release();
  await until(() => provider.prompts.length === 4 && !runner.isBusy(chatId));
  assert.deepEqual(users(), [
    ["1", null, null],
    ["依頼文を", true, null],
    ["2", null, null],
    ["渡した依頼", null, 99],
  ]);
  // 形の違う出どころは 400
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "x", handoff_from: { chat_id: "a" } })).status, 400);
});
