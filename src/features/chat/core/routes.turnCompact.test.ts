// API のテスト: 作業中のチャットの圧縮（圧縮中の様子・直後のコンテキスト・予約・手で消去・圧縮前指示）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { type CompactingState } from "@shared/chat/chatLive";
import { autoPreCompactMessage, manualPreCompactMessage, PRE_COMPACT_DONE, PRE_COMPACT_NUDGE } from "@shared/chat/prompts";

test("圧縮: 圧縮している間はチャットの詳細で始めた時刻ときっかけ（ふつうの指示の途中なら自動）を返し、SSE の chat_live でも知らせ、作業が終わったら消す", async () => {
  const { call, api, project, runner, provider, bus } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const seen: (CompactingState | null)[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.compacting);
  });
  provider.compacting = true;
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "続けて" } })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  const compacting: CompactingState = (await call("GET", `/api/chats/${chatId}`)).body.live.compacting;
  assert.equal(typeof compacting.since, "string");
  assert.equal(compacting.trigger, "auto");
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.compacting, null);
  // 圧縮中の様子は、なし → 始めた時刻ときっかけ → なし の順に届く（ほかの様子・段階・状態が変わった知らせでは、同じ値が続く）
  assert.deepEqual(
    seen.filter((v, i) => i === 0 || JSON.stringify(v) !== JSON.stringify(seen[i - 1])),
    [null, compacting, null],
  );
});

test("圧縮の直後: 作業の終わりを待たずに、要約したあとのコンテキストの大きさをチャットに書いて SSE で知らせる", async () => {
  const { api, project, store, runner, provider, bus } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "はじめ" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  store.chats.update(chatId, { context_tokens: 180_000, context_window: 200_000 });
  const seen: (number | null)[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat" && e.chat.id === chatId) seen.push(e.chat.context_tokens);
  });
  provider.contextTokens = 30_000;
  const release = provider.hold();
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続けて" } })).status, 200);
  // 作業中のまま、メーターの値が要約したあとの大きさになる
  await until(() => store.chats.get(chatId)?.context_tokens === 30_000);
  assert.equal(store.chats.get(chatId)?.status, "running");
  assert.ok(seen.includes(30_000));
  release();
  await until(() => !runner.isBusy(chatId));
});

test("圧縮の予約: 作業中の POST /compact は送信待ちのいちばん上に圧縮の行を入れ、行を消せばやめられる", async () => {
  const { api, project, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "続けて" } })).body.id;
  await until(() => runner.isBusy(chatId));
  assert.equal((await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } })).status, 200);
  const queued = (await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue.messages as { id: string; compact?: boolean }[];
  assert.equal(queued.length, 1);
  assert.equal(queued[0].compact, true);
  assert.equal((await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "remove", ids: [queued[0].id] }] } })).body.messages.length, 0);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal(provider.prompts.length, 1);
});

test("手でコンテキストを消去（POST /clear）: 作業していなければその場で消去して区切りを残し、作業中なら終わったらすぐ消去する予約（行を消せばやめられる）。会話がなければ 409", async () => {
  const { call, api, project, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  const cleared = await api("POST /api/chats/:chatId/clear", { params: { chatId: chatId } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.session_id, null);
  const detail = (await call("GET", `/api/chats/${chatId}`)).body;
  assert.equal(detail.events.at(-1).type, "context_cleared");
  assert.equal((await api("POST /api/chats/:chatId/clear", { params: { chatId: chatId } })).status, 409);
  // 作業中: 送信待ちのいちばん上に消去の行を入れる
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2" } });
  await until(() => runner.isBusy(chatId));
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "3", when: "later" } });
  assert.equal((await api("POST /api/chats/:chatId/clear", { params: { chatId: chatId } })).status, 200);
  const queued = (await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.live.queue.messages as { id: string; text: string; clear?: boolean }[];
  assert.deepEqual(queued.map((m) => (m.clear ? "消去" : m.text)), ["消去", "3"]);
  // 終わったら消去してから 3 を送る
  release();
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");
  const types = ((await api("GET /api/chats/:chatId", { params: { chatId: chatId } })).body.events as { type: string }[]).map((e) => e.type);
  assert.equal(types.filter((t) => t === "context_cleared").length, 2);
  await until(() => !runner.isBusy(chatId));
});

test("圧縮前指示: 手で圧縮すると、先に共通 → プロジェクトの指示を札付きの発言として送り、その作業が終わってから /compact を送る", async () => {
  const { call, api, project, store, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "はじめ" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  await call("PUT", "/api/settings", { pre_compact_prompt: " 共通の指示 " });
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_prompt: "プロジェクトの指示" } });
  const release = provider.hold();
  assert.equal((await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } })).status, 200);
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
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => provider.prompts.length === 4);
  await api("POST /api/chats/:chatId/cancel", { params: { chatId: chatId } });
  await until(() => !runner.isBusy(chatId));
  release2();
  assert.equal(provider.prompts.length, 4);

  // オフにした分は、文が残っていても送らない（残りのオンの分だけ）
  await call("PUT", "/api/settings", { pre_compact_enabled: false });
  const release3 = provider.hold();
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => provider.prompts.length === 5);
  assert.equal(provider.prompts[4], manualPreCompactMessage("プロジェクトの指示"));
  release3();
  await until(() => provider.prompts.length === 6 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[5], "/compact");

  // すべてオフ・指示がなければすぐ /compact
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_enabled: false } });
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => provider.prompts.length === 7 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[6], "/compact");
  await call("PUT", "/api/settings", { pre_compact_prompt: null, pre_compact_enabled: true });
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_prompt: null, pre_compact_enabled: true } });
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => provider.prompts.length === 8 && !runner.isBusy(chatId));
  assert.equal(provider.prompts[7], "/compact");
});

test("圧縮前指示: 自動の圧縮の前に足す指示は、コンテキストウィンドウが分かってから渡し、足したら記録して、圧縮するまで渡さない", async () => {
  const { call, api, project, store, runner, provider } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  await call("PUT", "/api/settings", { pre_compact_prompt: "ノートを書いて" });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "はじめ" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  // 最初の作業はウィンドウが分からない
  assert.equal(provider.preCompacts[0], null);
  store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
  provider.preCompactSentId = "pc-1";
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続けて" } });
  await until(() => !runner.isBusy(chatId));
  assert.deepEqual(provider.preCompacts[1], { message: autoPreCompactMessage("ノートを書いて"), contextWindow: 200_000, contextTokens: 120_000, nudge: PRE_COMPACT_NUDGE, doneMark: PRE_COMPACT_DONE });
  const user = store.events.list(chatId).find((e) => e.type === "user" && e.data.pre_compact)!;
  assert.ok(user.type === "user");
  assert.deepEqual([user.data.text, user.data.message_uuid], ["ノートを書いて", "pc-1"]);
  // 作業の区切りまで圧縮が来なかったので、続けて圧縮した（その実行には足さない）
  assert.equal(provider.prompts[2], "/compact");
  assert.equal(provider.preCompacts[2], null);
  // 送ったあとは、圧縮するまで渡さない
  store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "まだ" } });
  await until(() => !runner.isBusy(chatId));
  assert.equal(provider.preCompacts[3], null);
});

test("圧縮前指示から圧縮が終わるまで: 「いま」は預かって圧縮のあとに送り、区切りまで圧縮が来なければ作業の終わりで続けて圧縮する", async () => {
  const { call, api, project, store, runner, provider, bus } = setup({ features: ["chat", "compact", "settings", "subagents"] });
  const triggers: string[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live" && e.live.compacting && triggers.at(-1) !== e.live.compacting.trigger) triggers.push(e.live.compacting.trigger);
  });
  await call("PUT", "/api/settings", { pre_compact_prompt: "ノートを書いて" });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "はじめ" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  const users = () => store.events.list(chatId).flatMap((e) => (e.type === "user" ? [e.data.text] : []));

  // 自動の圧縮の前の指示を足したら、圧縮が終わるまで「いま」は足さずに預かる
  store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
  provider.preCompactSentId = "pc-1";
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続けて" } });
  await until(() => runner.live(chatId).compaction.awaiting);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "あ", when: "now" })).body.result, "held");
  assert.deepEqual(provider.told, []);
  assert.deepEqual(runner.live(chatId).now.map((m) => m.text), ["あ"]);
  // 指示の作業が区切りまで終わったら、ほかを送る前に自動の圧縮として続けて圧縮し、そのあとで預かった指示を送る
  provider.preCompactSentId = null;
  provider.compacting = true;
  release();
  await until(() => provider.prompts.at(-1) === "あ" && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts.slice(1), ["続けて", "/compact", "あ"]);
  assert.equal(triggers[0], "auto");
  assert.deepEqual(users(), ["はじめ", "続けて", "ノートを書いて", "あ"]);
  assert.equal(runner.live(chatId).compaction.awaiting, false);
  assert.deepEqual(runner.live(chatId).now, []);
  provider.compacting = false;

  // 手で圧縮する前の指示の作業の間も預かり、圧縮の実行が終わってから送る（送信待ちを止めていても送る）
  await api("POST /api/chats/:chatId/queue", { params: { chatId: chatId }, body: { commands: [{ op: "set_paused", paused: true }] } });
  const release2 = provider.hold();
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => provider.prompts.length === 5);
  assert.ok(runner.live(chatId).compaction.awaiting);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "い", when: "now" })).body.result, "held");
  release2();
  await until(() => provider.prompts.at(-1) === "い" && !runner.isBusy(chatId));
  assert.deepEqual(provider.prompts.slice(5), ["/compact", "い"]);
  assert.deepEqual(provider.told, []);

  // 指示の作業を止めたら圧縮せず、預かった指示はすぐ送る
  const release3 = provider.hold();
  await api("POST /api/chats/:chatId/compact", { params: { chatId: chatId } });
  await until(() => provider.prompts.length === 8);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "う", when: "now" })).body.result, "held");
  await api("POST /api/chats/:chatId/cancel", { params: { chatId: chatId } });
  await until(() => provider.prompts.length === 9);
  assert.equal(provider.prompts[8], "う");
  release3();
  await until(() => !runner.isBusy(chatId));
  assert.equal(runner.live(chatId).compaction.awaiting, false);
});

