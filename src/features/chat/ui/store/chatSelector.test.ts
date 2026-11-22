import assert from "node:assert/strict";
import { test } from "vitest";
import { createSelectorKit, memoLast, type ChatSource, type SelectorStore } from "./chatSelector";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { makeChat, makeEvent } from "@shared/foundation/testing/factories";
import { EMPTY_DETAIL } from "./chatDetail";
import { EMPTY_LOG, EMPTY_PROGRESS, type ChatDetailView, type ChatLogView, type ChatProgressView } from "./chatStoreTypes";

/** 口の値を手で差し替えられる偽の店の口 */
function fakeSource() {
  const state: { detail: ChatDetailView; log: ChatLogView; progress: ChatProgressView } = {
    detail: { state: "ready", chat: makeChat(1, { status: "running" }), approvals: [], live: EMPTY_DETAIL.live, error: null },
    log: EMPTY_LOG,
    progress: EMPTY_PROGRESS,
  };
  const source: ChatSource = { detail: () => state.detail, log: () => state.log, progress: () => state.progress };
  const setEvents = (events: ChatEvent[]) => (state.log = { ...EMPTY_LOG, digest: events, tail: events, events });
  return { state, source, setEvents };
}

/** 偽の店（覚えの入れ物は、店にあるチャットだけ持つ） */
function fakeStore(stored: number[]) {
  const { source, setEvents } = fakeSource();
  const memos = new Map(stored.map((id) => [id, new Map<object, unknown>()]));
  const store: SelectorStore = { ...source, subscribe: () => () => undefined, memos: (id) => memos.get(id) ?? null };
  return { store, memos, setEvents };
}

const countEvents = () => {
  const of = memoLast((events: readonly unknown[]) => ({ count: events.length }));
  return (src: ChatSource, chatId: number) => of(src.log(chatId).digest);
};

test("取り出し口: 入力が同じ物なら同じ結果を返し、記録が届いたら作り直す", () => {
  const { store, setEvents } = fakeStore([1]);
  const selector = createSelectorKit(store)(["log"], countEvents);
  setEvents([makeEvent(1, "text", { text: "a" })]);
  const first = selector.read(1);
  assert.equal(selector.read(1), first);
  setEvents([makeEvent(1, "text", { text: "a" }), makeEvent(2, "text", { text: "b" })]);
  assert.notEqual(selector.read(1), first);
  assert.equal(selector.read(1).count, 2);
});

test("取り出し口: チャットごとに別に覚え、店がチャットを捨てたら覚えも消える", () => {
  const { store, memos, setEvents } = fakeStore([1, 2]);
  let made = 0;
  const selector = createSelectorKit(store)(["log"], () => {
    made++;
    return countEvents();
  });
  setEvents([makeEvent(1, "text", { text: "a" })]);
  selector.read(1);
  selector.read(2);
  selector.read(1);
  assert.equal(made, 2);
  memos.set(1, new Map());
  selector.read(1);
  assert.equal(made, 3);
});

test("取り出し口: 店にないチャットも、同じ入力なら同じ物を返す", () => {
  const { store, setEvents } = fakeStore([]);
  const selector = createSelectorKit(store)(["log"], countEvents);
  setEvents([makeEvent(1, "text", { text: "a" })]);
  assert.equal(selector.read(9), selector.read(9));
});
