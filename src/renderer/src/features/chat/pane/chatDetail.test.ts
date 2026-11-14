import assert from "node:assert/strict";
import { test } from "node:test";
import type { Approval, BusEvent, Chat, ChatDetail, ChatEvent, ChatLive } from "@shared/types";
import { makeChat, makeEvent } from "@shared/testing/factories";
import { detailFromIncrement, detailFromSnapshot, EMPTY_DETAIL, reduceChatDetail, type ChatDetailState } from "./chatDetail";

const chat = (id: number, status: Chat["status"] = "running") => makeChat(id, { status });
const ev = (id: number, chatId = 1) => makeEvent(id, "text", { text: `#${id}` }, { chat_id: chatId });
const approval = (id: string, chatId = 1) => ({ id, chat_id: chatId }) as Approval;
const live = (paused: boolean): ChatLive => ({ ...EMPTY_DETAIL.live, queue: { ...EMPTY_DETAIL.live.queue, paused } });
const ids = (s: ChatDetailState) => s.events.map((e) => e.id);
const added = (event: ChatEvent): BusEvent => ({ type: "chat_event", project_id: 1, event });
const loaded: ChatDetailState = { chat: chat(1), events: [ev(1), ev(2)], approvals: [], live: EMPTY_DETAIL.live };
const run = (state: ChatDetailState, ...events: BusEvent[]) => events.reduce((s, e) => reduceChatDetail(s, e, 1), state);

test("reduceChatDetail: 記録を足す（同じ ID は重ねない）。巻き戻しはその発言から後ろを消す", () => {
  assert.deepEqual(ids(run(loaded, added(ev(3)))), [1, 2, 3]);
  // 同じ記録が 2 回届いても 1 つ
  assert.equal(run(loaded, added(ev(2))), loaded);
  assert.deepEqual(ids(run(loaded, added(ev(3)), added(ev(3)))), [1, 2, 3]);
  assert.deepEqual(ids(run(loaded, { type: "chat_events_deleted", project_id: 1, chat_id: 1, from_event_id: 2 })), [1]);
});

test("reduceChatDetail: ほかのチャットの知らせでは変えない", () => {
  assert.equal(run(loaded, added(ev(9, 2))), loaded);
  assert.equal(run(loaded, { type: "chat", chat: chat(2) }), loaded);
  assert.equal(run(loaded, { type: "approval", approval: approval("x", 2) }), loaded);
  assert.equal(run(loaded, { type: "chat_live", project_id: 1, chat_id: 2, live: live(true) }), loaded);
});

test("reduceChatDetail: チャット・作業中の様子は置き換え、回答待ちは足す・外す（同じ ID は重ねない）", () => {
  assert.equal(run(loaded, { type: "chat", chat: chat(1, "completed") }).chat?.status, "completed");
  assert.equal(run(loaded, { type: "chat_live", project_id: 1, chat_id: 1, live: live(true) }).live.queue.paused, true);
  const asked = run(loaded, { type: "approval", approval: approval("a") }, { type: "approval", approval: approval("a") });
  assert.deepEqual(asked.approvals.map((a) => a.id), ["a"]);
  assert.deepEqual(run(asked, { type: "approval_resolved", id: "a", chat_id: 1 }).approvals, []);
});

test("detailFromSnapshot: 読み込みの最中に届いた知らせを当て直す（サーバーが中身を作る前のものは重ならず、あとのものは足される）", () => {
  const snapshot: ChatDetail = { chat: chat(1), events: [ev(1), ev(2), ev(3)], approvals: [approval("a")], live: live(false), has_earlier: false, after_missing: false };
  // 3 は中身にもう入っている。4 と、回答の済んだ a・止めた様子は、中身を作ったあとに届いた
  const missed: BusEvent[] = [
    added(ev(3)),
    added(ev(4)),
    { type: "approval_resolved", id: "a", chat_id: 1 },
    { type: "chat_live", project_id: 1, chat_id: 1, live: live(true) },
  ];
  const next = detailFromSnapshot(snapshot, missed, 1);
  assert.deepEqual(ids(next), [1, 2, 3, 4]);
  assert.deepEqual(next.approvals, []);
  assert.equal(next.live.queue.paused, true);
});

test("detailFromSnapshot: 中身を作ったあとに巻き戻して送り直した記録も、順に当て直せば残る", () => {
  // 巻き戻し（2 から後ろを消す）のあとに送った発言 5 は、中身にも、届いた知らせにもある
  const snapshot: ChatDetail = { chat: chat(1), events: [ev(1), ev(5)], approvals: [], live: live(false), has_earlier: false, after_missing: false };
  const missed: BusEvent[] = [{ type: "chat_events_deleted", project_id: 1, chat_id: 1, from_event_id: 2 }, added(ev(5))];
  assert.deepEqual(ids(detailFromSnapshot(snapshot, missed, 1)), [1, 5]);
});

test("detailFromSnapshot: 取り直しで作業中の様子が変わっていなければ、前のものを使う（記録をたどる計算をやり直さない）", () => {
  const prev: ChatDetailState = { ...loaded, live: live(true) };
  const next = detailFromSnapshot({ chat: chat(1), events: loaded.events, approvals: [], live: live(true), has_earlier: false, after_missing: false }, [], 1, prev);
  assert.equal(next.live.queue, prev.live.queue);
});

test("detailFromIncrement: つなぎ直したときに after で読んだ分を、持っている記録の後ろに足す（重ねない）。チャット・回答待ち・様子は読んだもの", () => {
  const prev: ChatDetailState = { ...loaded, events: [ev(1), ev(2)] };
  const snapshot: ChatDetail = { chat: chat(1, "completed"), events: [ev(2), ev(3), ev(4)], approvals: [approval("b")], live: live(true), has_earlier: false, after_missing: false };
  const next = detailFromIncrement(snapshot, [added(ev(5))], 1, prev);
  assert.deepEqual(ids(next), [1, 2, 3, 4, 5]);
  assert.equal(next.chat?.status, "completed");
  assert.deepEqual(next.approvals.map((a) => a.id), ["b"]);
  assert.equal(next.live.queue.paused, true);
});
