// API のテスト: 作業中のチャット（未読・作業中の様子 live・裏の作業・再試行・停止・止めずに伝える・作業の終わり・サブエージェントの報告の受け渡し・発言の印）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { EMPTY_CHAT_LIVE, EMPTY_QUEUE_STATE, type ChatLive } from "@shared/chat/chatLive";

test("未読: 作業中も AI の文章の返答で未読にし、一番下まで見た記録より新しい結果があれば既読にしない", async () => {
  const { call, api, project, store, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  // ツールの実行・サブエージェントの返答では未読にしない
  provider.emits = [
    { type: "tool_use", id: "t1", name: "Read", input: {} },
    { type: "text", text: "サブの返答", parent: "t1" },
  ];
  let release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "やって" } })).body.id;
  await until(() => store.chats.get(chatId)?.status === "running" && store.events.list(chatId).some((e) => e.type === "tool_use"));
  assert.equal(store.chats.get(chatId)?.unread, false);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await api("POST /api/chats/:chatId/seen", { params: { chatId: chatId } })).body.unread, false);

  // 作業中に AI の文章の返答が届いたら未読（作業中のまま）
  provider.emits = [{ type: "text", text: "途中の返答" }];
  release = provider.hold();
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続けて" } })).status, 200);
  await until(() => store.chats.get(chatId)?.unread === true);
  assert.equal(store.chats.get(chatId)?.status, "running");
  const textId = store.events.list(chatId).findLast((e) => e.type === "text")!.id;
  // 一番下まで見た（その返答まで）: 既読
  assert.equal((await api("POST /api/chats/:chatId/seen", { params: { chatId: chatId }, body: { event_id: textId } })).body.unread, false);
  release();
  await until(() => !runner.isBusy(chatId));
  // 終わった: 未読。終わりの結果より前までしか見ていなければ未読のまま、終わりまで見たら既読
  assert.equal(store.chats.get(chatId)?.unread, true);
  assert.equal((await api("POST /api/chats/:chatId/seen", { params: { chatId: chatId }, body: { event_id: textId } })).body.unread, true);
  const lastId = store.events.list(chatId).at(-1)!.id;
  assert.equal((await api("POST /api/chats/:chatId/seen", { params: { chatId: chatId }, body: { event_id: lastId } })).body.unread, false);
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: "x" })).status, 400);
});

test("裏で動いている作業: 作業中はチャットの詳細で返し、SSE の chat_live でも知らせ、作業が終わったら消す", async () => {
  const { api, project, runner, provider, bus } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const seen: unknown[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.background);
  });
  const state = { tasks: [{ task_id: "b1", kind: "command" as const, description: "npm run dev" }], replied: true };
  provider.background = state;
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "動かして" } })).body.id;
  await until(() => runner.live(chatId).background !== null);
  assert.deepEqual((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.background, state);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.background, null);
  assert.deepEqual(seen.filter((v, i) => i === 0 || JSON.stringify(v) !== JSON.stringify(seen[i - 1])), [null, state, null]);
});

test("作業中の様子: チャットの詳細の live と SSE の chat_live は同じ形で、どれかが変わったときだけ丸ごと届く", async () => {
  const { api, project, runner, provider, bus } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const lives: ChatLive[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") lives.push(JSON.parse(JSON.stringify(e.live)));
  });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "次", when: "later" } });
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  // 変わらなければ知らせない（作った直後の送る準備 → 作業中・送信待ちに入れた・止めた）
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  assert.deepEqual(lives.map((l) => l.phase), ["preparing", "running", "running", "running"]);
  const last = lives.at(-1)!;
  assert.deepEqual((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live, last);
  assert.deepEqual(
    last.queue.messages.map((m) => m.text),
    ["次"],
  );
  assert.deepEqual(
    { ...last, queue: { ...last.queue, messages: [] } },
    { ...EMPTY_CHAT_LIVE, queue: { ...EMPTY_QUEUE_STATE, paused: true, waiting: "busy" }, phase: "running", status: "running" },
  );
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } });
  release();
  await until(() => !runner.isBusy(chatId));
});

test("再試行: AI の API への通信を再試行している間はチャットの詳細でも返し、作業が終わったら消す", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const retry = { attempt: 2, max_retries: 10, retry_delay_ms: 4000, at: new Date().toISOString() };
  provider.retry = retry;
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "動かして" } })).body.id;
  await until(() => runner.live(chatId).retry !== null);
  assert.deepEqual((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.retry, retry);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.retry, null);
});

test("停止: 止めるよう頼んでから作業が終わるまでは、詳細と SSE の chat_live で停止中を知らせる", async () => {
  const { api, project, runner, provider, bus } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const seen: boolean[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.stopping);
  });
  provider.hold();
  let finish = () => {};
  provider.slowStop = new Promise((resolve) => (finish = resolve));
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "動かして" } })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.stopping, false);
  // 止めるよう頼んだだけで返すものはない（停止中は SSE の chat_live で届く）
  assert.deepEqual(await api("POST /api/chats/:chatId/cancel", { params: { chatId: chatId } }), { status: 204, body: undefined });
  const once = seen.length; await api("POST /api/chats/:chatId/cancel", { params: { chatId: chatId } }); assert.equal(seen.length, once); // 2 回押しても知らせは 1 回
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.stopping, true);
  assert.equal(runner.isBusy(chatId), true);
  finish();
  await until(() => !runner.isBusy(chatId));
  const detail = (await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body;
  assert.equal(detail.live.stopping, false);
  assert.equal(detail.chat.status, "cancelled");
  assert.deepEqual(seen.filter((v, i) => i === 0 || v !== seen[i - 1]), [false, true, false]);
});

test("作業の終わり: 終わりの知らせがないまま止まったサブエージェントは、通信以外ならお知らせを残す", async () => {
  const { api, project, provider, store } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.", is_error: false },
  ];
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  assert.ok(store.events.list(chatId).some((e) => e.type === "notice" && /サブエージェント 1 件（調査）/.test(JSON.stringify(e.data))));
  // 次の実行では、前の実行のものを数え直さない
  provider.emits = [];
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "次" } });
  await until(() => store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  assert.equal(store.events.list(chatId).filter((e) => e.type === "notice" && /作業の終わりとともに/.test(JSON.stringify(e.data))).length, 1);
});

test("届かなかったサブエージェントの報告: 次に送る指示に本文を添えて渡し、自分の発言に印を残す（渡したら次からは添えない）", async () => {
  const { api, project, provider, store } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  // 裏で動かしたサブエージェントが報告を送ったが、親が動かないまま作業が終わった
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.\nagentId: a1", is_error: false },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "見つけたのは 3 件" },
  ];
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  provider.emits = [];
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "次" } });
  await until(() => provider.prompts.length === 2);
  assert.ok(provider.prompts[1].startsWith("次\n"));
  assert.match(provider.prompts[1], /「調査」（ID: a1）の報告 ---\n見つけたのは 3 件/);
  const user = store.events.list(chatId).filter((e) => e.type === "user").at(-1)!;
  // 記録の自分の発言は、書いた文のまま（報告は印だけ）
  const { message_uuid: _id, ...userData } = user.data as { message_uuid?: string };
  assert.deepEqual(userData, { text: "次", handover: ["tu1"] });
  await until(() => store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "その次" } });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "その次");
});

test("止めずに伝える API: 作業中なら止めずに足して自分の発言に残し、足せなければ預かって作業の終わりに送信待ちより先に送る。作業中でなければすぐ送る", async () => {
  const { call, api, project, runner, provider, store } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  // 作業中: 止めずに足す（待ちの列には入れない。作業も止めない）
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "ついでに", when: "now" })).body.result, "told");
  assert.deepEqual(provider.told, ["ついでに"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  assert.equal(runner.isBusy(chatId), true);
  assert.equal((store.events.list(chatId).findLast((e) => e.type === "user")?.data as { text?: string }).text, "ついでに");
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { when: "now" } })).status, 400);
  // 足せない（入力が閉じている）ときは送信待ちに戻さず預かる。このあとの「いま」と、行の「すぐ送る」も預かりの後ろへ
  provider.acceptTell = false;
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "あとで", when: "now" })).body.result, "held");
  assert.equal(runner.live(chatId).input_closed, true);
  provider.acceptTell = true;
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "続けて", when: "now" })).body.result, "held");
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "送信待ち", when: "later" } });
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "すぐ送る", when: "later" } });
  await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: [runner.live(chatId).queue.messages[1].id] } });
  assert.deepEqual(runner.live(chatId).now.map((m) => m.text), ["あとで", "続けて", "すぐ送る"]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["送信待ち"]);
  assert.deepEqual(provider.told, ["ついでに"]);
  // 裏の作業を 1 つ止める
  assert.equal((await api("POST /api/chats/:chatId/background/:taskId/stop", { params: { chatId: chatId, taskId: "b1" } })).status, 204);
  assert.deepEqual(provider.stoppedTasks, ["b1"]);
  // 送信待ちを止めていても、預かった指示は作業の終わりに送信待ちより先に送る（1 件目を新しい作業として、残りはその作業に）
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  release();
  await until(() => runner.live(chatId).now.length === 0 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[1], "あとで");
  assert.deepEqual([...provider.prompts.slice(2), ...provider.told.slice(1)].sort(), ["すぐ送る", "続けて"]);
  assert.equal(runner.live(chatId).input_closed, false);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["送信待ち"]);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } });
  // 作業中でなければ 409（状態による失敗）
  assert.equal((await api("POST /api/chats/:chatId/background/:taskId/stop", { params: { chatId: chatId, taskId: "b1" } })).status, 409);
  // 作業中でなければ、すぐ送る
  const sent = provider.prompts.length;
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "ふつう", when: "now" })).body.result, "sent");
  await until(() => provider.prompts.length === sent + 1);
  assert.equal(provider.prompts.at(-1), "ふつう");
});

test("発言の印（依頼文の頼み・子チャットから渡した依頼）は、送る・送信待ちに入れる・送信待ちから送るのどの道でも発言の記録に残る", async () => {
  const { call, api, project, runner, provider, store } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  const users = () => store.events.list(chatId).filter((e) => e.type === "user").map((e) => (e.type === "user" ? [e.data.text, e.data.handoff_request ?? null, e.data.handoff_from?.chat_id ?? null] : []));
  // 送る
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "依頼文を", handoff_request: true } });
  await until(() => !runner.isBusy(chatId));
  // 作業中に送信待ちへ入れ、終わったら送る（印は送信待ちの行に残り、送ったときの記録にも残る）
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2" } });
  await until(() => runner.isBusy(chatId));
  const queued = (await call("POST", `/api/chats/${chatId}/messages`, { text: "渡した依頼", handoff_from: { chat_id: 99, title: "子" }, when: "later" })).body;
  assert.deepEqual(queued.queue.messages[0].handoff_from, { chat_id: 99, title: "子" });
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
