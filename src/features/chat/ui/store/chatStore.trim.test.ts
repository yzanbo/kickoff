import assert from "node:assert/strict";
import { test } from "vitest";
import type { Approval } from "@shared/chat/approvalTypes";
import { CHAT_TAIL_TURNS } from "@shared/chat/detail";
import { settle } from "@shared/foundation/testing/async";
import { PREFETCH_QUEUE } from "./prefetch";
import { WARM_CHATS } from "./chatStoreTypes";
import { chatOf, detail, setup, text } from "./storeTesting";

test("見る部品のないチャットは WARM_CHATS 件まで残し、古く見なくなったものから捨てる（知っているチャットからも忘れる）", async () => {
  const { store, chats, loads, clock } = setup();
  for (let id = 1; id <= WARM_CHATS + 1; id++) {
    const h = store.retain(id, "visible");
    loads.at(-1)?.resolve(detail(chatOf(id)));
    await settle();
    clock.advance(1);
    h.release();
  }
  assert.equal(store.size(), WARM_CHATS);
  assert.equal(store.detail(1).chat, undefined);
  assert.equal(chats.get(1), undefined);
  assert.equal(store.detail(2).chat?.id, 2);
  assert.equal(chats.get(2)?.id, 2);
});

test("読み込みの印は中身を読めたら ready。チャットは知っているチャットから引き、読み込みの最中に届いたチャットの知らせを当て直して入れる", async () => {
  const s = setup();
  s.store.retain(1, "visible");
  assert.equal(s.store.detail(1).state, "loading");
  s.store.apply({ type: "chat", chat: chatOf(1, "completed") });
  s.loads[0].resolve(detail(chatOf(1, "running")));
  await settle();
  assert.equal(s.store.detail(1).state, "ready");
  assert.equal(s.chats.get(1)?.status, "completed");
  assert.equal(s.store.detail(1).chat?.status, "completed");
  s.store.markPainted(1);
  // 知っているチャットが直ったら、知らせで見せ直す
  s.chats.update(chatOf(1, "failed"));
  s.store.apply({ type: "chat", chat: chatOf(1, "failed") });
  s.clock.advance(200);
  assert.equal(s.store.detail(1).chat?.status, "failed");
  // 引けなくなっても（消した）、前に見せたもののまま
  s.chats.forget(1);
  s.store.apply({ type: "chat", chat: chatOf(1, "failed") });
  s.clock.advance(200);
  assert.equal(s.store.detail(1).chat?.status, "failed");
});

test("回答待ちは回答待ちの店から引き（詳細の応答のものは使わない）、変わったチャットだけ見せ直す", async () => {
  const s = setup();
  const asked = { id: "a", chat_id: 1 } as Approval;
  s.store.retain(1, "visible");
  s.store.retain(2, "visible");
  s.loads[0].resolve({ ...detail(chatOf(1)), approvals: [asked] });
  s.loads[1].resolve(detail(chatOf(2)));
  await settle();
  s.store.markPainted(1);
  s.store.markPainted(2);
  assert.deepEqual(s.store.detail(1).approvals, []);
  const other = s.store.detail(2);
  const c = s.counts(1);
  s.approvals.set(1, [asked]);
  s.store.approvalsChanged();
  s.clock.advance(200);
  assert.deepEqual(s.store.detail(1).approvals, [asked]);
  assert.equal(c.detail, 1);
  assert.equal(s.store.detail(2), other);
});

test("先読みは見る部品を増やさずに読み、開いたときは読み直さずにすぐ見せる（案 4 の先読み）", async () => {
  const s = setup();
  const done = s.store.prefetch(3);
  assert.deepEqual(s.loads[0].query, { tail_turns: CHAT_TAIL_TURNS });
  // 読み込み中にもう一度頼んでも 1 回
  void s.store.prefetch(3);
  assert.equal(s.loads.length, 1);
  s.loads[0].resolve(detail(chatOf(3, "completed"), [text(1, 3)]));
  await done;
  assert.deepEqual(s.store.log(3).events.map((e) => e.id), [1]);
  s.store.retain(3, "visible");
  assert.equal(s.loads.length, 1);
  assert.deepEqual(s.store.log(3).events.map((e) => e.id), [1]);
});

test("先読みしただけのチャットは、見なくなったチャットとは別に数える。見ているチャットの読み込み中は busy", async () => {
  const s = setup();
  void s.store.prefetch(500);
  s.loads[0].resolve(detail(chatOf(500, "completed")));
  await settle();
  for (let id = 1; id <= WARM_CHATS + 1; id++) {
    const h = s.store.retain(id, "visible");
    assert.equal(s.store.busy(), true);
    s.loads.at(-1)!.resolve(detail(chatOf(id, "completed")));
    await settle();
    s.clock.advance(1);
    h.release();
  }
  assert.equal(s.store.busy(), false);
  // 見なくなったものは WARM_CHATS 件（いちばん古い 1 を捨てた）、先読みは残る
  assert.equal(s.store.size(), WARM_CHATS + 1);
  assert.equal(s.store.detail(1).chat, undefined);
  assert.equal(s.store.detail(500).chat?.id, 500);
});

test("見ていないチャットが WARM_CHATS 件あっても、新しい先読みは残り、2 回目の先読みで読み直さない", async () => {
  const s = setup();
  for (let id = 1; id <= WARM_CHATS; id++) {
    const h = s.store.retain(id, "visible");
    s.loads.at(-1)!.resolve(detail(chatOf(id, "completed")));
    await settle();
    s.clock.advance(1);
    h.release();
  }
  const done = s.store.prefetch(500);
  s.loads.at(-1)!.resolve(detail(chatOf(500, "completed")));
  await done;
  assert.equal(s.store.detail(500).chat?.id, 500);
  const before = s.loads.length;
  await s.store.prefetch(500);
  assert.equal(s.loads.length, before);
});

test("先読みしただけのチャットが PREFETCH_QUEUE 件を超えたら、いちばん古い先読みだけを捨てる", async () => {
  const s = setup();
  const h = s.store.retain(1, "visible");
  s.loads[0].resolve(detail(chatOf(1, "completed")));
  await settle();
  h.release();
  for (let id = 100; id <= 100 + PREFETCH_QUEUE; id++) {
    const done = s.store.prefetch(id);
    s.loads.at(-1)!.resolve(detail(chatOf(id, "completed")));
    await done;
  }
  assert.equal(s.store.size(), PREFETCH_QUEUE + 1);
  assert.equal(s.store.detail(100).chat, undefined);
  assert.equal(s.store.detail(101).chat?.id, 101);
  assert.equal(s.store.detail(1).chat?.id, 1);
});
