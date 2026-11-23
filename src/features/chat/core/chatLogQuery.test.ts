import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatEvent, ChatEventData } from "@shared/chat/chatEvent";
import { indexOfEvents, metaOfEvent } from "@shared/chat/chatIndex";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import type { ChatStoreDeps } from "./stores";
import { testStore } from "@/app/core/testing/testStore";
import { buildIndex, pageAfter, pageAround, pageBefore, pageSince, scopeEvents, tailStart } from "./chatLogQuery";

/** 一時の DB にチャットを 2 つ作り、記録を交互に足す（記録の ID はチャットをまたいで振るので、ID が続かない形で確かめる） */
function seeded(events: readonly ChatEvent[]) {
  const store = testStore(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "長い", status: "completed", model: null });
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "ほか", status: "completed", model: null });
  events.forEach((e, i) => {
    store.events.add(chat.id, { type: e.type, ...e.data } as ChatEventData);
    if (i % 3 === 0) store.events.add(other.id, { type: "notice", message: "ほかのチャット" });
  });
  return { store, chatId: chat.id, saved: store.events.list(chat.id) };
}

const add = (store: ChatStoreDeps, chatId: number, data: ChatEventData) => store.events.add(chatId, data).id;

/** ターン 1 つ（自分の発言・返答・ツール・作業の終わり）を足し、作業の終わりの ID を返す */
function turn(store: ChatStoreDeps, chatId: number, n: number, opts: { tell?: boolean; bigBytes?: number } = {}) {
  add(store, chatId, { type: "user", text: `指示 ${n}`, message_uuid: `u${n}` });
  add(store, chatId, { type: "text", text: `返答 ${n}${"あ".repeat(opts.bigBytes ?? 0)}` });
  if (opts.tell) add(store, chatId, { type: "user", text: `作業中に伝えた ${n}`, message_uuid: `t${n}` });
  add(store, chatId, { type: "tool_use", id: `c${n}`, name: "Bash", input: { command: "ls" } });
  add(store, chatId, { type: "tool_result", tool_use_id: `c${n}`, content: "ok", is_error: false });
  return add(store, chatId, { type: "result", status: "completed", text: `写し ${n}` });
}

test("覆う索引から読んだ軽い形は記録から作ったものと同じで、buildIndex は全件を読んで selectIndexIds に流したものと同じ記録を返す", () => {
  const { store, chatId, saved } = seeded(scenarioChat({ turns: 30, seed: 11 }));
  assert.deepEqual(store.events.metas(chatId, 0, Number.MAX_SAFE_INTEGER).map((r) => r.meta), saved.map(metaOfEvent));
  const ctx = { approvalCallIds: [], backgroundCallIds: [] };
  for (const s of [0, 1, 37, Math.floor(saved.length / 2), saved.length - 1]) {
    const start = saved[s].id;
    assert.deepEqual(buildIndex(store, chatId, start, ctx), indexOfEvents(saved, start, ctx), `切れ目 ${s}`);
  }
});

test("軽い形を読む SQL は覆う索引だけを使い、作業の終わりの ID も索引で引く", () => {
  const store = testStore(":memory:");
  const plan = (sql: string) => (store.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1, 0, 100) as { detail: string }[]).map((r) => r.detail).join(" / ");
  const metas = `SELECT id, type, json_extract(data, '$.id'), json_extract(data, '$.name'), json_extract(data, '$.parent'), json_extract(data, '$.tool_use_id'),
    json_extract(data, '$.task_id'), json_extract(data, '$.status'), length(data) FROM chat_events WHERE chat_id = ? AND id >= ? AND id < ? ORDER BY id`;
  assert.match(plan(metas), /USING COVERING INDEX idx_chat_events_meta/);
});

test("tailStart: 作業の終わりを境目にターンを数え、作業中に伝えた発言では切らない", () => {
  const store = testStore(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chatId = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "completed", model: null }).id;
  const ends = [1, 2, 3, 4].map((n) => turn(store, chatId, n, { tell: true }));
  const { start, headPartial } = tailStart(store, chatId, { turns: 2, maxBytes: 1e9 });
  assert.equal(start, ends[1] + 1);
  assert.equal(headPartial, false);
  // 末尾の頭は自分の発言（作業中に伝えた発言ではない）
  assert.deepEqual(store.events.range(chatId, start, Number.MAX_SAFE_INTEGER)[0].data, { text: "指示 3", message_uuid: "u3" });
  // 作業中（最後に作業の終わりがない）なら、作業中の分 ＋ 2 ターン
  add(store, chatId, { type: "user", text: "指示 5", message_uuid: "u5" });
  assert.equal(tailStart(store, chatId, { turns: 2, maxBytes: 1e9 }).start, ends[1] + 1);
  // ターンが足りなければ最初から
  assert.equal(tailStart(store, chatId, { turns: 10, maxBytes: 1e9 }).start, 0);
});

test("tailStart: 大きさの上限を超えたら新しい方へずらし（最新の 1 ターンは残す）、最新のメインの返答が前にあればそのターンまで広げる", () => {
  const store = testStore(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chatId = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "completed", model: null }).id;
  const ends = [1, 2, 3].map((n) => turn(store, chatId, n, { bigBytes: n === 2 ? 5000 : 0 }));
  assert.equal(tailStart(store, chatId, { turns: 3, maxBytes: 3000 }).start, ends[1] + 1);
  assert.equal(tailStart(store, chatId, { turns: 3, maxBytes: 10 }).start, ends[1] + 1);
  // 返答のないターンが続いたら、最新のメインの返答のターンの頭まで広げる
  for (const n of [4, 5]) {
    add(store, chatId, { type: "user", text: `指示 ${n}`, message_uuid: `u${n}` });
    add(store, chatId, { type: "result", status: "completed" });
  }
  assert.equal(tailStart(store, chatId, { turns: 1, maxBytes: 1e9 }).start, ends[1] + 1);
});

test("tailStart: 最新の 1 ターンが大きすぎれば、終わりから上限までにして headPartial", () => {
  const store = testStore(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chatId = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "completed", model: null }).id;
  turn(store, chatId, 1);
  add(store, chatId, { type: "user", text: "大きい", message_uuid: "big" });
  const ids = Array.from({ length: 2005 }, (_, i) => add(store, chatId, { type: "text", text: `${i}` }));
  const { start, headPartial } = tailStart(store, chatId);
  assert.equal(headPartial, true);
  assert.equal(store.events.range(chatId, start, Number.MAX_SAFE_INTEGER).length, 2000);
  assert.equal(start, ids[5]);
});

test("pageBefore・pageSince・pageAround・pageAfter・scopeEvents・mainTexts", () => {
  const store = testStore(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chatId = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "completed", model: null }).id;
  const ends = Array.from({ length: 10 }, (_, i) => turn(store, chatId, i + 1));
  const heads = [0, ...ends.map((e) => e + 1)];
  const all = store.events.list(chatId);
  // さかのぼる: before の手前の 2 ターン
  const before = pageBefore(store, chatId, heads[8], 2);
  assert.equal(before.events[0].id, heads[6]);
  assert.equal(before.events.at(-1)!.id, ends[7]);
  assert.equal(before.has_earlier, true);
  assert.equal(pageBefore(store, chatId, heads[2], 5).has_earlier, false);
  // since 以上 before 未満
  assert.deepEqual(pageSince(store, chatId, heads[3], heads[1]).events.map((e) => e.id), all.filter((e) => e.id >= heads[1] && e.id < heads[3]).map((e) => e.id));
  // 前後: 5 ターン目の中の記録から、前へ 3 ターン・合わせて 5 ターン（until の手前まで）
  const around = pageAround(store, chatId, ends[4] - 2, 5, heads[9]);
  assert.equal(around.events[0].id, heads[1]);
  assert.equal(around.events.at(-1)!.id, ends[5]);
  assert.equal(around.has_later, true);
  // 後ろへ: until に届いたら has_later は false
  const after = pageAfter(store, chatId, ends[5], 5, heads[9]);
  assert.equal(after.events[0].id, heads[6]);
  assert.equal(after.events.at(-1)!.id, ends[8]);
  assert.equal(after.has_later, false);
  // サブエージェントの中
  add(store, chatId, { type: "tool_use", id: "agent", name: "Agent", input: { description: "調べる" } });
  const inner = add(store, chatId, { type: "text", text: "中", parent: "agent" });
  add(store, chatId, { type: "text", text: "外" });
  assert.deepEqual(scopeEvents(store, chatId, ["agent"], [ends[0]], Number.MAX_SAFE_INTEGER).map((e) => e.id), [ends[0], inner]);
  // 検索の本文: 自分の発言とメインの返答だけ
  const texts = store.events.mainTexts(chatId, Number.MAX_SAFE_INTEGER);
  assert.ok(texts.every((e) => e.type === "user" || (e.type === "text" && !e.data.parent)));
  assert.equal(texts.length, 21);
});
