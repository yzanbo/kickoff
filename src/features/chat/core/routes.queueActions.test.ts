// API のテスト: 送信待ちの列の質問として送る・圧縮とコンテキスト消去の行・/clear・起動したときの再開の確かめ（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { EMPTY_QUEUE_STATE } from "@shared/chat/chatLive";

test("質問として送る（pause_after）: その指示の作業が終わったら送信待ちを自動で送らずに一時停止する。来なければ印は外れる", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  let release = provider.hold();
  const chatId = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);

  // あとで（送信待ちに入れる）: 入れたその指示のすぐあとに印を付ける
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2", when: "later" } });
  const asked = (await call("POST", `/api/chats/${chatId}/messages`, { text: "質問?", pause_after: true, when: "later" })).body;
  assert.deepEqual(asked.queue.stops, [2]);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "4", when: "later" } });
  release();
  // 「質問?」まで送ったら、残りは送らずに線の所で待つ（止めておくにはしない）
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId) && runner.live(chatId).queue.stops[0] === 0);
  assert.equal(runner.live(chatId).queue.paused, false);
  assert.deepEqual(provider.prompts.slice(1), ["2", "質問?"]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["4"]);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } });

  // いま（作業中に伝える）: いまの作業が終わったら、そのあいだに来た指示の前で止める
  release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "5" } });
  await until(() => provider.prompts.length === 4);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "これは?", pause_after: true, when: "now" })).body.result, "told");
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "6", when: "later" } });
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).queue.stops[0] === 0);
  assert.equal(provider.prompts.length, 4);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["6"]);
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "clear" }] } });

  // すぐ送る（作業していない）: その作業のあいだに何も来なければ、終わったときに印を外す（あとで送った作業では止めない）
  release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "どう?", pause_after: true } });
  await until(() => provider.prompts.length === 5);
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual(runner.live(chatId).queue, EMPTY_QUEUE_STATE);
  // 作業していないときの「あとで」でも同じ（すぐ送って、その作業の終わりで止める）
  release = provider.hold();
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "なぜ?", pause_after: true, when: "later" })).body.result, "sent");
  await until(() => provider.prompts.length === 6);
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "7", when: "later" } });
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).queue.stops[0] === 0);
  assert.equal(provider.prompts.length, 6);
});

test("送信待ちの圧縮の行（命令の add_action）: いちばん下・指示のすぐあとに足す。書き直せず、まとめない。すぐ送ると圧縮する", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  const two = (await call("POST", `/api/chats/${chatId}/messages`, { text: "2", when: "later" })).body.queue.messages.at(-1).id as string;
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "3", when: "later" } });
  const labels = (body: { messages: { text: string; compact?: boolean }[] }) => body.messages.map((m) => (m.compact ? "圧縮" : m.text));
  assert.deepEqual(labels((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "add_action", action: "compact", after: null }] } })).body), ["2", "3", "圧縮"]);
  // 2 のすぐあと（2 のあとの一時停止の線より上）
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "stop_after", id: two, stop: true }] } });
  const after = (await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "add_action", action: "compact", after: two }] } })).body;
  assert.deepEqual(labels(after), ["2", "圧縮", "3", "圧縮"]);
  assert.deepEqual(after.stops, [2]);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "add_action", action: "compact", after: "nope" }] } })).status, 404);
  const compactId = after.messages[1].id as string;
  // 書き直せない。まとめるときは圧縮の行を数えず、列に残す
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: compactId, text: "x" }] } })).status, 400);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "merge", ids: [two, compactId] }] } })).status, 400);
  const ids = after.messages.map((m: { id: string }) => m.id) as string[];
  const merged = (await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "merge", ids: ids }] } })).body;
  assert.deepEqual(labels(merged), ["2\n\n3", "圧縮", "圧縮"]);
  // 止めているときに、作業中の圧縮の行を「すぐ送る」と、いちばん上へ移る（いまのやり取りが終わったらすぐ圧縮する）。
  // 止めるのは 1 件目の上の線に置き換わり、圧縮だけは送ってからその線で待つ
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_stops", stops: [] }] } });
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  const moved = (await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: [merged.messages[2].id] } })).body;
  assert.deepEqual(labels(moved), ["圧縮", "2\n\n3", "圧縮"]);
  assert.equal(moved.paused, false);
  assert.deepEqual(moved.stops, [1]);
  release();
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[1], "/compact");
  // 作業していないときに「すぐ送る」と、すぐ圧縮する
  const rest = (await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue;
  assert.equal(rest.paused, false);
  assert.deepEqual(rest.stops, [0]);
  await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: [rest.messages[1].id] } });
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[2], "/compact");
  assert.deepEqual(labels((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue), ["2\n\n3"]);
});

test("送信待ちのコンテキスト消去の行（命令の add_action）: 足して、書き直せず、作業していないときにすぐ送ると消去して記録に残す", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  const two = (await call("POST", `/api/chats/${chatId}/messages`, { text: "2", when: "later" })).body.queue.messages.at(-1).id as string;
  const labels = (body: { messages: { text: string; clear?: boolean }[] }) => body.messages.map((m) => (m.clear ? "消去" : m.text));
  const added = (await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "add_action", action: "clear", after: two }] } })).body;
  assert.deepEqual(labels(added), ["2", "消去"]);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "add_action", action: "clear", after: "nope" }] } })).status, 404);
  const clearId = added.messages[1].id as string;
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "edit", id: clearId, text: "x" }] } })).status, 400);
  // 止めておいて作業を終え、消去の行だけを「すぐ送る」
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  release();
  await until(() => !runner.isBusy(chatId));
  assert.ok((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.chat.session_id);
  const sent = (await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: [clearId] } })).body;
  assert.deepEqual(labels(sent), ["2"]);
  const detail = (await call("GET", `/api/chats/${chatId}`)).body;
  assert.equal(detail.chat.session_id, null);
  assert.equal(detail.events.at(-1).type, "context_cleared");
  // 会話がないので、もう一度足して「すぐ送る」と 409
  const again = (await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "add_action", action: "clear", after: null }] } })).body.messages[1].id as string;
  assert.equal((await api("POST /api/chats/:chatId/queue/send", { params: { chatId: chatId }, body: { mode: "now", ids: [again] } })).status, 409);
});

test("チャット欄の /clear: Claude Code に送らず、作業していなければその場で消去（区切りを残す）、作業中なら終わったらすぐ消去する予約、あとで送るなら消去の行", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "queue"] });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  const labels = (body: { messages: { text: string; clear?: boolean }[] }) => body.messages.map((m) => (m.clear ? "消去" : m.text));
  const types = async () => ((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.events as { type: string }[]).map((e) => e.type);
  // 作業していない: 送ると、その場で消去する（発言も実行も残さず、記録には区切り）
  const sent = await call("POST", `/api/chats/${chatId}/messages`, { text: " /clear " });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.session_id, null);
  assert.equal((await types()).at(-1), "context_cleared");
  assert.deepEqual(provider.prompts, ["1"]);
  // もう会話がないので、もう一度は 409
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "/clear" } })).status, 409);
  // 作業中の「いま」: 終わったらすぐ消去する予約（送信待ちのいちばん上に消去の行）
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2" } });
  await until(() => provider.prompts.length === 2);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "3", when: "later" } });
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "/clear", when: "now" })).body.result, "queued");
  // 作業中の「あとで」: いちばん下に消去の行
  const queued = (await call("POST", `/api/chats/${chatId}/messages`, { text: "/clear", when: "later" })).body;
  assert.deepEqual(labels(queued.queue), ["消去", "3", "消去"]);
  // 作業が終わったら消去してから 3 を送る（3 は新しい会話で始まる）
  release();
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");
  assert.ok((await types()).filter((t) => t === "context_cleared").length >= 2);
  assert.deepEqual(provider.prompts.includes("/clear"), false);
});

test("起動したときの再開の確かめの API: 一覧と答え（チャットごと。答えたあとの残りを返す）", async () => {
  const { call, api } = setup({ features: ["chat", "queue"] });
  assert.deepEqual((await api("GET /api/restart-resumes")).body, []);
  assert.equal((await call("POST", "/api/restart-resumes", {})).status, 400);
  assert.equal((await call("POST", "/api/restart-resumes", { decisions: [{ chat_id: 1, action: "later" }] })).status, 400);
  // 確かめを待っていないチャットへの答えは飛ばす
  const answered = await api("POST /api/restart-resumes", { body: { decisions: [{ chat_id: 999, action: "send" }] } });
  assert.deepEqual([answered.status, answered.body], [200, []]);
});

test("起動したときの再開の確かめの API: 途中で止まったチャットを送信待ちがなくても一覧に出し、送信待ちのないチャットへの「送る」は 400（どれも変えない）", async () => {
  const ids: Record<string, number> = {};
  // 前回の起動: 作業中のまま落ちたチャットが 2 つと、自動で送るまま送信待ちが残ったチャット
  const { call, api, store, runner, provider } = setup({
    features: ["chat", "queue"],
    beforeStart: (store, project) => {
      const make = (title: string, status: "running" | "completed") => store.chats.create({ project_id: project.id, provider: "claude", title, status, model: null }).id;
      [ids.crashed, ids.later, ids.queued] = [make("落ちた", "running"), make("あとで", "running"), make("送信待ち", "completed")];
      store.events.add(ids.crashed, { type: "user", text: "調べて", message_uuid: randomUUID() });
      store.outbox.save(ids.queued, { now: [], later: [{ id: "q1", text: "次", options: {}, attachments: [], created_at: "2026-11-16T00:00:00.000Z" }], paused: false, stops: [] });
      return store.chats.recoverInterrupted("アプリの終了により中断しました");
    },
  });
  type Listed = { chat_id: number; interrupted: boolean; queued: boolean; messages: unknown[]; last_prompt: { text: string } | null };
  const listed = (await api("GET /api/restart-resumes")).body;
  assert.deepEqual(
    listed.map((r) => [r.chat_id, r.interrupted, r.queued, r.messages.length]),
    [
      [ids.crashed, true, false, 0],
      [ids.later, true, false, 0],
      [ids.queued, false, true, 1],
    ],
  );
  assert.equal(listed[0].last_prompt?.text, "調べて");
  assert.deepEqual((await api("GET /api/chats/:chatId", { params: { chatId: ids.crashed } })).body.live.restart_resume, { interrupted: true, queued: false });

  // 送信待ちのないチャットに「送る」は 400。一緒に送ったほかの答えも変えない
  const refused = await call("POST", "/api/restart-resumes", {
    decisions: [
      { chat_id: ids.queued, action: "pause" },
      { chat_id: ids.crashed, action: "send" },
    ],
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /送信待ちのないチャットには/);
  assert.equal((await api("GET /api/restart-resumes")).body.length, 3);
  assert.equal(runner.live(ids.queued).queue.paused, false);

  // 続ける / 送る: 答えたチャットは外れ、答えなかった（あとで）チャットだけが残る
  const answered = await api("POST /api/restart-resumes", { body: {
    decisions: [
      { chat_id: ids.crashed, action: "continue" },
      { chat_id: ids.queued, action: "send" },
    ],
  } });
  assert.equal(answered.status, 200);
  assert.deepEqual(
    (answered.body as Listed[]).map((r) => r.chat_id),
    [ids.later],
  );
  await until(() => provider.prompts.length === 2);
  assert.ok(provider.prompts.some((p) => /アプリの終了で止まったところから/.test(p)));
  assert.ok(provider.prompts.includes("次"));
  await until(() => !runner.isBusy(ids.crashed) && !runner.isBusy(ids.queued));
  // 次に起動しても、答えなかったチャットだけを聞く
  assert.deepEqual(store.chats.recoverInterrupted("アプリの終了により中断しました"), [ids.later]);
});
