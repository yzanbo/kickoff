import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent, Chat, ChatDetail, ChatDetailQuery, ChatEvent } from "@shared/types";
import { makeChat, makeEvent } from "@shared/testing/factories";
import { EMPTY_DETAIL } from "./chatDetail";
import { createChatStore, OPEN_HOLD_MAX_MS, PUBLISH_FALLBACK_MS, STREAM_FLUSH_MS, WARM_CHATS } from "./chatStore";

/** 偽の rAF・タイマー・時計・読み込みで作った店（テストごとに新しく作る） */
function setup() {
  let now = 0;
  let hidden = false;
  const frames = new Set<() => void>();
  let timers: { at: number; fn: () => void }[] = [];
  const loads: { chatId: number; query: ChatDetailQuery; resolve: (d: ChatDetail) => void; reject: (e: Error) => void }[] = [];
  const store = createChatStore({
    frame: (fn) => {
      const f = () => fn();
      frames.add(f);
      return () => frames.delete(f);
    },
    timer: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => (timers = timers.filter((x) => x !== t));
    },
    now: () => now,
    windowHidden: () => hidden,
    load: (chatId, query) => new Promise((resolve, reject) => loads.push({ chatId, query, resolve, reject })),
  });
  /** 次のフレームを描く（予約された rAF を呼ぶ） */
  const frame = () => {
    const all = [...frames];
    frames.clear();
    for (const f of all) f();
  };
  /** 時計を進め、時刻の来たタイマーを順に呼ぶ */
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.fn();
    }
    now = until;
  };
  /** 口ごとの知らせの回数 */
  const counts = (chatId: number) => {
    const c = { detail: 0, log: 0, progress: 0, streaming: 0 };
    for (const channel of ["detail", "log", "progress", "streaming"] as const) store.subscribe(chatId, channel, () => c[channel]++);
    return c;
  };
  return { store, frame, advance, loads, counts, setHidden: (h: boolean) => (hidden = h) };
}

/** 読み込みの応答を返し終えるまで待つ */
const settle = () => new Promise((r) => setTimeout(r, 0));

const chatOf = (id: number, status: Chat["status"] = "running") => makeChat(id, { status });
const text = (id: number, chatId = 1, data: { text: string; parent?: string } = { text: `#${id}` }) => makeEvent(id, "text", data, { chat_id: chatId });
const added = (event: ChatEvent): BusEvent => ({ type: "chat_event", project_id: 1, event });
const delta = (t: string, offset?: number, chatId = 1): BusEvent => ({ type: "chat_delta", project_id: 1, chat_id: chatId, text: t, ...(offset !== undefined && { offset }) });
const detail = (chat: Chat, events: ChatEvent[] = [], streaming: string | null = null): ChatDetail => ({
  chat,
  events,
  has_earlier: false,
  after_missing: false,
  approvals: [],
  live: EMPTY_DETAIL.live,
  streaming_text: streaming,
  streaming_length: streaming?.length ?? 0,
});

/** チャット 1 を開いて読み込み、開いた直後のため方も終えた店 */
async function opened(events: ChatEvent[] = [text(1)], streaming: string | null = null) {
  const s = setup();
  const handle = s.store.retain(1, "visible");
  s.loads[0].resolve(detail(chatOf(1), events, streaming));
  await settle();
  s.store.markPainted(1);
  return { ...s, handle };
}

test("同じチャットを何か所で開いても読み込みは 1 回で、見る部品がなくなっても中身を残す", async () => {
  const { store, loads } = setup();
  const a = store.retain(1, "visible");
  const b = store.retain(1, "hidden");
  assert.equal(loads.length, 1);
  assert.deepEqual(loads[0].query, {});
  loads[0].resolve(detail(chatOf(1), [text(1)]));
  await settle();
  assert.equal(store.detail(1).chat?.id, 1);
  assert.deepEqual(store.log(1).events.map((e) => e.id), [1]);
  a.release();
  b.release();
  // 戻ったらすぐ出る（読み直さない）
  store.retain(1, "visible");
  assert.equal(loads.length, 1);
  assert.equal(store.detail(1).chat?.id, 1);
});

test("開いた直後は待たずに 1 回見せ、描き終えるまでに届いた知らせは markPainted で 1 回にまとめて当てる", async () => {
  const { store, loads, counts, frame } = setup();
  const c = counts(1);
  store.retain(1, "visible");
  loads[0].resolve(detail(chatOf(1), [text(1)]));
  await settle();
  assert.equal(c.log, 1);
  for (let i = 2; i <= 21; i++) store.apply(added(text(i)));
  frame();
  assert.equal(c.log, 1);
  assert.equal(store.log(1).events.length, 1);
  store.markPainted(1);
  assert.equal(c.log, 2);
  assert.equal(store.log(1).events.length, 21);
});

test("描き終えの知らせが来なくても OPEN_HOLD_MAX_MS で当てる", async () => {
  const { store, loads, counts, advance } = setup();
  const c = counts(1);
  store.retain(1, "visible");
  loads[0].resolve(detail(chatOf(1)));
  await settle();
  store.apply(added(text(2)));
  advance(OPEN_HOLD_MAX_MS - 1);
  assert.equal(c.log, 1);
  advance(1);
  assert.equal(c.log, 2);
});

test("ふだんは同じフレームに届いた知らせを 1 回で当て、変わっていない口は同じ値のまま", async () => {
  const { store, counts, frame } = await opened();
  const c = counts(1);
  const before = store.detail(1);
  for (let i = 2; i <= 6; i++) store.apply(added(text(i)));
  assert.equal(c.log, 0);
  frame();
  assert.equal(c.log, 1);
  assert.equal(c.detail, 0);
  assert.equal(store.detail(1), before);
  assert.equal(store.log(1).events.length, 6);
});

test("rAF が来ない（隠れたウィンドウ）ときは PUBLISH_FALLBACK_MS で当てる", async () => {
  const { store, counts, advance } = await opened();
  const c = counts(1);
  store.apply(added(text(2)));
  advance(PUBLISH_FALLBACK_MS);
  assert.equal(c.log, 1);
});

test("書いている途中の返答は見え方ごとの間隔でまとめて当て、表に出したらすぐ当てる", async () => {
  const { store, counts, advance, handle, setHidden } = await opened();
  const c = counts(1);
  store.apply(delta("こん", 0));
  store.apply(delta("にちは", 2));
  advance(STREAM_FLUSH_MS.visible - 1);
  assert.equal(store.streamText(1, 0), "");
  advance(1);
  assert.equal(store.streamText(1, 0), "こんにちは");
  assert.equal(c.streaming, 1);
  // 見えている所がない: 100ms
  handle.setVisibility("hidden");
  store.apply(delta("。", 5));
  advance(STREAM_FLUSH_MS.visible);
  assert.equal(store.streamText(1, 0), "こんにちは");
  advance(STREAM_FLUSH_MS.hidden - STREAM_FLUSH_MS.visible);
  assert.equal(store.streamText(1, 0), "こんにちは。");
  // ウィンドウが隠れている: 200ms。表に出したらすぐ
  setHidden(true);
  store.apply(delta("元気", 6));
  advance(STREAM_FLUSH_MS.hidden);
  assert.equal(store.streamText(1, 0), "こんにちは。");
  handle.setVisibility("visible");
  assert.equal(store.streamText(1, 0), "こんにちは。元気");
  // 届いた時刻は届いたとき（当てたときではない）に進む
  assert.equal(typeof store.streamLastAt(1), "string");
});

test("確定した返答が記録に入る差し替えと途中の文が消える差し替えは同じ 1 回（消す前の世代は差し替えまで同じ文を返す）", async () => {
  const { store, counts, advance, frame } = await opened();
  store.apply(delta("答え", 0));
  advance(STREAM_FLUSH_MS.visible);
  const c = counts(1);
  const gen = store.log(1).streamGen;
  store.apply(added(text(2, 1, { text: "答え" })));
  // まだ差し替えていない: 前の世代は消す前の文のまま、途中の文の購読者には知らせない
  assert.equal(store.streamText(1, gen), "答え");
  assert.equal(c.streaming, 0);
  // 差し替えたあとの次の返答は新しい世代に入る
  store.apply(delta("次", 0));
  advance(STREAM_FLUSH_MS.visible);
  assert.equal(store.streamText(1, gen), "答え");
  frame();
  const log = store.log(1);
  assert.equal(c.log, 1);
  assert.equal(log.streamGen, gen + 1);
  assert.deepEqual(log.events.map((e) => e.id), [1, 2]);
  assert.equal(store.streamText(1, log.streamGen), "次");
});

test("サブエージェントの記録では途中の文を消さない", async () => {
  const { store, advance, frame } = await opened();
  store.apply(delta("メインの文", 0));
  advance(STREAM_FLUSH_MS.visible);
  store.apply(added(text(2, 1, { text: "サブ", parent: "toolu_1" })));
  frame();
  assert.equal(store.log(1).streamGen, 0);
  assert.equal(store.streamText(1, 0), "メインの文");
});

test("詳細の書きかけの返答から始め、読み込みの最中に届いた途中の文は位置で重なりを捨てて足す", async () => {
  const { store, loads } = setup();
  store.retain(1, "visible");
  // 読み込みの最中に届いた分（詳細の文に入っている所と、そのあとの所）
  store.apply(delta("にちは", 2));
  store.apply(delta("。元気", 5));
  loads[0].resolve(detail(chatOf(1), [text(1)], "こんにちは"));
  await settle();
  assert.equal(store.streamText(1, store.log(1).streamGen), "こんにちは。元気");
  // 作業中でなければ消す
  const other = setup();
  other.store.retain(2, "visible");
  other.loads[0].resolve(detail(chatOf(2, "completed"), [], "残り"));
  await settle();
  assert.equal(other.store.streamText(2, other.store.log(2).streamGen), "");
});

test("SSE をつなぎ直したら、見ているチャットは ?after= で取り直し、見ていないチャットは次に見るときに取り直す", async () => {
  const { store, loads, frame } = setup();
  const a = store.retain(1, "visible");
  const b = store.retain(2, "visible");
  loads[0].resolve(detail(chatOf(1), [text(1)]));
  loads[1].resolve(detail(chatOf(2), [text(5, 2)]));
  await settle();
  store.markPainted(1);
  b.release();
  store.reconnected();
  assert.equal(loads.length, 3);
  assert.deepEqual(loads[2], { ...loads[2], chatId: 1, query: { after: 1 } });
  loads[2].resolve(detail(chatOf(1), [text(2)]));
  await settle();
  frame();
  assert.deepEqual(store.log(1).events.map((e) => e.id), [1, 2]);
  store.retain(2, "visible");
  assert.equal(loads.length, 4);
  assert.deepEqual(loads[3].query, { after: 5 });
  a.release();
});

test("持っていた最後の記録が巻き戻しで消えていたら、すべて読み直す", async () => {
  const { store, loads, frame } = await opened([text(1), text(2)]);
  store.reconnected();
  loads[1].resolve({ ...detail(chatOf(1)), after_missing: true });
  await settle();
  assert.deepEqual(loads[2].query, {});
  loads[2].resolve(detail(chatOf(1), [text(1)]));
  await settle();
  frame();
  assert.deepEqual(store.log(1).events.map((e) => e.id), [1]);
});

test("一度も読めなかったら失敗を出し、もう一度見るときに読み直す", async () => {
  const { store, loads } = setup();
  const h = store.retain(1, "visible");
  loads[0].reject(new Error("つながりません"));
  await settle();
  assert.equal(store.detail(1).error, "つながりません");
  h.release();
  store.retain(1, "visible");
  assert.equal(loads.length, 2);
});

test("見る部品のないチャットは WARM_CHATS 件まで残し、古く見なくなったものから捨てる", async () => {
  const { store, loads, advance } = setup();
  for (let id = 1; id <= WARM_CHATS + 1; id++) {
    const h = store.retain(id, "visible");
    loads.at(-1)?.resolve(detail(chatOf(id)));
    await settle();
    advance(1);
    h.release();
  }
  assert.equal(store.size(), WARM_CHATS);
  assert.equal(store.detail(1).chat, undefined);
  assert.equal(store.detail(2).chat?.id, 2);
});

test("サブエージェントの途中経過を作業 ID ごとに覚え、届いた時刻も持つ", async () => {
  const { store, counts, frame } = await opened();
  const c = counts(1);
  store.apply({ type: "chat_subagent", project_id: 1, chat_id: 1, subagent: { task_id: "t1" } as never });
  // 店にないチャットの知らせは当てない
  store.apply({ type: "chat_subagent", project_id: 1, chat_id: 9, subagent: { task_id: "t9" } as never });
  frame();
  assert.equal(c.progress, 1);
  assert.deepEqual(Object.keys(store.progress(1).progress), ["t1"]);
  assert.equal(typeof store.progress(1).progressAt.t1, "string");
  assert.deepEqual(store.progress(9).progress, {});
});
