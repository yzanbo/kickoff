// API のテスト: 送る口 1 本（POST /messages の when）と送信待ちの口（POST /queue の commands・POST /queue/send・PUT /queue/editing の lane）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";

const texts = (body: { messages: { text: string }[] }) => body.messages.map((m) => m.text);

/** 作業中のチャット（偽のプロバイダーは release まで終わらない） */
async function busyChat() {
  const ctx = setup();
  const release = ctx.provider.hold();
  const chatId = (await ctx.call("POST", `/api/projects/${ctx.project.id}/chats`, { text: "1" })).body.id as number;
  await until(() => ctx.provider.prompts.length === 1);
  return { ...ctx, chatId, release };
}

test("送る口: when を省けば作業中は 409（前からの口・答えはチャット）。now は止めずに伝え、later は送信待ちに入れる（答えは結果・チャット・送信待ち）", async () => {
  const { call, chatId, provider, runner, release } = await busyChat();
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "x" })).status, 409);
  const told = (await call("POST", `/api/chats/${chatId}/messages`, { text: "いま", when: "now" })).body;
  assert.deepEqual([told.result, told.chat.id, told.chat.status, told.queue.messages], ["told", chatId, "running", []]);
  assert.deepEqual(provider.told, ["いま"]);
  const queued = (await call("POST", `/api/chats/${chatId}/messages`, { text: "次", when: "later" })).body;
  assert.deepEqual([queued.result, texts(queued.queue)], ["queued", ["次"]]);
  release();
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  // 作業していなければ、when があってもすぐ送る（前からの口は答えがチャット）
  const sent = (await call("POST", `/api/chats/${chatId}/messages`, { text: "続き", when: "later" })).body;
  assert.deepEqual([sent.result, sent.chat.status], ["sent", "running"]);
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "さらに" })).body.id, chatId);
  await until(() => !runner.isBusy(chatId));
});

test("送信待ちの命令の列: 全部通るか、1 つも変えない（答えはそのあとの送信待ち）", async () => {
  const { call, chatId, release } = await busyChat();
  for (const text of ["a", "b", "c"]) await call("POST", `/api/chats/${chatId}/messages`, { text, when: "later" });
  const ids = ((await call("GET", `/api/chats/${chatId}`)).body.live.queue.messages as { id: string }[]).map((m) => m.id);
  const moved = (await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "move", ids: [ids[2]], to: "top" }, { op: "stop_after", id: ids[2], stop: true }] })).body;
  assert.deepEqual([texts(moved), moved.stops], [["c", "a", "b"], [1]]);
  // 1 つでも断られたら、前の命令も当てない
  const rejected = await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "set_paused", paused: true }, { op: "remove", ids: ["nope"] }] });
  assert.equal(rejected.status, 404);
  const live = (await call("GET", `/api/chats/${chatId}`)).body.live.queue;
  assert.deepEqual([texts(live), live.paused], [["c", "a", "b"], false]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, { commands: [] })).status, 400);
  const removed = (await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "remove", ids: [ids[0]] }, { op: "add_action", action: "compact", after: null }] })).body;
  assert.deepEqual(texts(removed), ["c", "b", ""]);
  await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "clear" }] });
  release();
});

test("送信待ちをすぐ送る口: now はその 1 件を伝え、all はまとめて 1 件に、in_order は止めていても順に送る。書き直しは lane で預かりも", async () => {
  const { call, chatId, provider, runner, release } = await busyChat();
  for (const text of ["a", "b", "c"]) await call("POST", `/api/chats/${chatId}/messages`, { text, when: "later" });
  const ids = ((await call("GET", `/api/chats/${chatId}`)).body.live.queue.messages as { id: string }[]).map((m) => m.id);
  assert.deepEqual(texts((await call("POST", `/api/chats/${chatId}/queue/send`, { mode: "now", ids: [ids[0]] })).body), ["b", "c"]);
  assert.deepEqual(provider.told, ["a"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send`, { mode: "now", ids: ["nope"] })).status, 404);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send`, { mode: "later" })).status, 400);
  // 書き直している行（lane を省けば送信待ち）
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [ids[1]] })).body.messages.length, 2);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/editing`, { lane: "now", ids: [] })).status, 200);
  await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [] });
  assert.deepEqual(texts((await call("POST", `/api/chats/${chatId}/queue/send`, { mode: "all" })).body), []);
  assert.equal(provider.told.length, 2);
  await call("POST", `/api/chats/${chatId}/messages`, { text: "d", when: "later" });
  await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "set_paused", paused: true }] });
  release();
  await until(() => !runner.isBusy(chatId));
  await call("POST", `/api/chats/${chatId}/queue/send`, { mode: "in_order" });
  await until(() => provider.prompts.at(-1) === "d");
  await until(() => !runner.isBusy(chatId));
});
