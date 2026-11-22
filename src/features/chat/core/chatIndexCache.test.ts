import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { ChatEvent, ChatEventData } from "@shared/chat/chatEvent";
import { indexOfEvents, type IndexContext } from "@shared/chat/chatIndex";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import { testStore } from "@/app/core/testing/testStore";
import { ChatIndexCache } from "./chatIndexCache";

const NO_CTX: IndexContext = { approvalCallIds: [], backgroundCallIds: [] };

function newChat(store: ChatStoreDeps, title = "長い") {
  const project = store.projects.list()[0] ?? store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  return store.chats.create({ project_id: project.id, provider: "claude", title, status: "completed", model: null }).id;
}

/** 記録を足す（ほかのチャットの記録も間に挟み、ID が続かない形にする） */
function append(store: ChatStoreDeps, chatId: number, other: number, events: readonly ChatEvent[]) {
  events.forEach((e, i) => {
    store.events.add(chatId, { type: e.type, ...e.data } as ChatEventData);
    if (i % 4 === 0) store.events.add(other, { type: "notice", message: "ほかのチャット" });
  });
}

/** 全件を読んで決まりに流したもの（覚えのない答え） */
const reference = (store: ChatStoreDeps, chatId: number, start: number, ctx: IndexContext) => indexOfEvents(store.events.list(chatId), start, ctx);

test("覚えた索引は、始まりが前後に動いても・外の ID が変わっても・記録が増えても、全件から作ったものと同じ", () => {
  const store = testStore(":memory:");
  const chatId = newChat(store);
  const other = newChat(store, "ほか");
  const all = scenarioChat({ turns: 40, seed: 7 });
  append(store, chatId, other, all.slice(0, Math.floor(all.length / 2)));
  const cache = new ChatIndexCache(store);
  const check = (start: number, ctx: IndexContext = NO_CTX) => assert.deepEqual(cache.index(chatId, start, ctx), reference(store, chatId, start, ctx), `始まり ${start}`);
  const ids = () => store.events.list(chatId).map((e) => e.id);
  const first = ids();
  for (const s of [10, 30, 20, first.length - 1, 5]) check(first[s]);
  // 回答待ちの呼び出しを指すと、その呼び出しも軽く入る
  const call = store.events.list(chatId).find((e) => e.type === "tool_use" && e.id < first[30]);
  if (call?.type === "tool_use") check(first[30], { approvalCallIds: [call.data.id], backgroundCallIds: [] });
  // 記録が増えて始まりが後ろへ動く
  append(store, chatId, other, all.slice(Math.floor(all.length / 2)));
  const later = ids();
  for (const s of [later.length - 3, later.length - 1, first.length]) check(later[s]);
});

test("同じ始まりなら読み直さず、記録が増えたら増えた分の軽い形と、まだ持っていない行だけを読む", () => {
  const store = testStore(":memory:");
  const chatId = newChat(store);
  const other = newChat(store, "ほか");
  const all = scenarioChat({ turns: 30, seed: 3 });
  append(store, chatId, other, all.slice(0, 100));
  const cache = new ChatIndexCache(store);
  const metas = vi.spyOn(store.events, "metas");
  const byIds = vi.spyOn(store.events, "byIds");
  const start = store.events.list(chatId).at(-1)!.id;
  const first = cache.index(chatId, start, NO_CTX);
  assert.equal(metas.mock.calls.length, 1);
  assert.equal(metas.mock.calls[0][1], 0);
  // 同じ始まりは同じ配列をそのまま返す
  assert.equal(cache.index(chatId, start, NO_CTX), first);
  assert.equal(metas.mock.calls.length, 1);
  assert.equal(byIds.mock.calls.length, 1);
  // 増えた分だけ読む
  append(store, chatId, other, all.slice(100));
  const next = store.events.list(chatId).at(-1)!.id;
  const readIds = byIds.mock.calls[0][1].length;
  assert.deepEqual(cache.index(chatId, next, NO_CTX), reference(store, chatId, next, NO_CTX));
  assert.equal(metas.mock.calls.length, 2);
  assert.equal(metas.mock.calls[1][1], start);
  assert.ok(byIds.mock.calls[1][1].length < readIds + (next - start), "持っている行は読み直さない");
});

test("巻き戻し・セッションの付け替え・チャットの削除で、そのチャットの覚えを捨てる", () => {
  const store = testStore(":memory:");
  const chatId = newChat(store);
  const other = newChat(store, "ほか");
  store.events.add(chatId, { type: "init", session_id: "s-old" } as ChatEventData);
  append(store, chatId, other, scenarioChat({ turns: 20, seed: 5 }));
  const cache = new ChatIndexCache(store);
  const end = () => store.events.list(chatId).at(-1)!.id;
  const tailStart = end();
  cache.index(chatId, tailStart, NO_CTX);
  // セッションの付け替え: 索引の init も新しいセッションになる
  store.events.remapSession(chatId, "s-old", "s-new");
  const remapped = cache.index(chatId, tailStart, NO_CTX);
  assert.deepEqual(remapped, reference(store, chatId, tailStart, NO_CTX));
  assert.equal(remapped.find((e) => e.type === "init")?.data.session_id, "s-new");
  // 巻き戻し: 消したあとに足した記録で、同じ ID の範囲が変わっても全件と同じ
  const events = store.events.list(chatId);
  store.events.deleteFrom(chatId, events[Math.floor(events.length / 2)].id);
  append(store, chatId, other, scenarioChat({ turns: 5, seed: 9 }));
  assert.deepEqual(cache.index(chatId, end(), NO_CTX), reference(store, chatId, end(), NO_CTX));
  // チャットの削除: 覚えを捨てる（次は頭から読む）
  const before = end();
  cache.index(chatId, before, NO_CTX);
  const metas = vi.spyOn(store.events, "metas");
  store.chats.delete(chatId);
  cache.index(chatId, before, NO_CTX);
  assert.equal(metas.mock.calls.at(-1)?.[1], 0);
});

test("覚えるチャットの数を超えたら、最後に読んだのが古いものから捨てる", () => {
  const store = testStore(":memory:");
  const chats = [newChat(store, "a"), newChat(store, "b"), newChat(store, "c")];
  for (const id of chats) append(store, id, chats[0] === id ? chats[1] : chats[0], scenarioChat({ turns: 3, seed: id }));
  const cache = new ChatIndexCache(store, 2);
  const last = (id: number) => store.events.list(id).at(-1)!.id;
  for (const id of chats) cache.index(id, last(id), NO_CTX);
  const metas = vi.spyOn(store.events, "metas");
  cache.index(chats[2], last(chats[2]), NO_CTX);
  assert.equal(metas.mock.calls.length, 0, "新しいものは覚えている");
  cache.index(chats[0], last(chats[0]), NO_CTX);
  assert.equal(metas.mock.calls.length, 1, "古いものは捨てた");
});
