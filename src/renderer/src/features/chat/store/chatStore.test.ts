import assert from "node:assert/strict";
import { test } from "vitest";
import { CHAT_TAIL_TURNS, type BusEvent, type Chat, type ChatDetail, type ChatDetailQuery, type ChatEvent, type ChatEventPage, type ChatEventsQuery } from "@shared/types";
import { makeChat, makeEvent } from "@shared/testing/factories";
import { EMPTY_DETAIL } from "./chatDetail";
import { createChatStore, OPEN_HOLD_MAX_MS, PUBLISH_FALLBACK_MS, SHRINK_AFTER_MS, STREAM_FLUSH_MS, WARM_CHATS } from "./chatStore";

/** 偽の rAF・タイマー・時計・読み込みで作った店（テストごとに新しく作る） */
function setup() {
  let now = 0;
  let hidden = false;
  const frames = new Set<() => void>();
  const idles = new Set<() => void>();
  let timers: { at: number; fn: () => void }[] = [];
  const loads: { chatId: number; query: ChatDetailQuery; resolve: (d: ChatDetail) => void; reject: (e: Error) => void }[] = [];
  const pages: { chatId: number; query: ChatEventsQuery; resolve: (p: ChatEventPage) => void; reject: (e: Error) => void }[] = [];
  const store = createChatStore({
    frame: (fn) => {
      const f = () => fn();
      frames.add(f);
      return () => frames.delete(f);
    },
    idle: (fn) => {
      const f = () => fn();
      idles.add(f);
      return () => idles.delete(f);
    },
    timer: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => (timers = timers.filter((x) => x !== t));
    },
    now: () => now,
    windowHidden: () => hidden,
    load: (chatId, query) => new Promise((resolve, reject) => loads.push({ chatId, query, resolve, reject })),
    page: (chatId, query) => new Promise((resolve, reject) => pages.push({ chatId, query, resolve, reject })),
  });
  /** 次のフレームを描く（予約された rAF を呼ぶ） */
  const frame = () => {
    const all = [...frames];
    frames.clear();
    for (const f of all) f();
  };
  /** 手すきの予約を呼ぶ */
  const idle = () => {
    const all = [...idles];
    idles.clear();
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
  return { store, frame, idle, idles, advance, loads, pages, counts, setHidden: (h: boolean) => (hidden = h) };
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
  assert.deepEqual(loads[0].query, { tail_turns: CHAT_TAIL_TURNS });
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
  assert.deepEqual(loads[2].query, { tail_turns: CHAT_TAIL_TURNS });
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

/** 末尾（5 から 7）と索引（作業の終わり 2・4）で開いた店（記録 1〜7。作業の終わりは 2・4・6） */
async function openedTail() {
  const s = setup();
  const handle = s.store.retain(1, "visible");
  const result = (id: number) => makeEvent(id, "result", { status: "completed" }, { chat_id: 1 });
  s.loads[0].resolve({ ...detail(chatOf(1, "completed"), [text(5), result(6), text(7)]), has_earlier: true, index: [result(2), result(4)], head_partial: false });
  await settle();
  s.store.markPainted(1);
  return { ...s, handle, result };
}

test("末尾で開き、前を読み足す・遠い記録を途中の一部分として読む・末尾に戻る（メモの仕様書「0023_表示を軽くする」の案 4）", async () => {
  const { store, pages, frame, result } = await openedTail();
  assert.deepEqual([store.log(1).tailStart, store.log(1).hasEarlier], [5, true]);
  assert.deepEqual(store.log(1).digest.map((e) => e.id), [2, 4, 5, 6, 7]);
  // 前を読み足す
  const earlier = store.loadEarlier(1);
  assert.deepEqual(pages[0].query, { before: 5, turns: CHAT_TAIL_TURNS });
  assert.equal(store.loadEarlier(1), earlier);
  pages[0].resolve({ events: [text(3), result(4)], has_earlier: true, has_later: false, head_partial: false });
  await earlier;
  frame();
  assert.deepEqual(store.log(1).events.map((e) => e.id), [3, 4, 5, 6, 7]);
  assert.deepEqual(store.log(1).digest.map((e) => e.id), [2, 3, 4, 5, 6, 7]);
  // 近い記録は末尾を伸ばす（頭のターンの頭から）
  const near = store.openAround(1, 1);
  assert.deepEqual(pages[1].query, { before: 3, since: 0 });
  pages[1].resolve({ events: [text(1), result(2)], has_earlier: false, has_later: false, head_partial: false });
  await near;
  frame();
  assert.equal(store.shows(1, 1), true);
  assert.equal(store.log(1).focused, false);
});

test("遠い記録は途中の一部分にし、一番下へ戻ると末尾に戻る。末尾より前で巻き戻したら末尾から読み直す", async () => {
  const { store, pages, loads, frame, result } = await openedTail();
  // 遠い（読み足しの 2 回分のターンより前）とみなすよう、索引の作業の終わりを増やす
  const many = Array.from({ length: CHAT_TAIL_TURNS * 2 + 2 }, (_, i) => result(1000 + i));
  loads.length = 0;
  store.reconnected();
  loads[0].resolve({ ...detail(chatOf(1, "completed"), []), after_missing: true });
  await settle();
  loads[1].resolve({ ...detail(chatOf(1, "completed"), [text(5000)]), has_earlier: true, index: many });
  await settle();
  frame();
  const far = store.openAround(1, 999);
  assert.deepEqual(pages[0].query, { around: 999, turns: CHAT_TAIL_TURNS, until: 5000 });
  pages[0].resolve({ events: [text(998), text(999)], has_earlier: true, has_later: true, head_partial: false });
  await far;
  frame();
  assert.deepEqual([store.log(1).focused, store.log(1).events.map((e) => e.id)], [true, [998, 999]]);
  assert.deepEqual(store.log(1).tail.map((e) => e.id), [5000]);
  store.backToTail(1);
  frame();
  assert.equal(store.log(1).focused, false);
  // 末尾より前で巻き戻した
  store.apply({ type: "chat_events_deleted", project_id: 1, chat_id: 1, from_event_id: 999 });
  assert.deepEqual(loads[2].query, { tail_turns: CHAT_TAIL_TURNS });
});

test("見る部品がなくなって 10 分たったら、末尾を最新のターンに縮め、その前を索引に移す（U7）", async () => {
  const s = setup();
  const handle = s.store.retain(1, "visible");
  const turns = Array.from({ length: CHAT_TAIL_TURNS + 5 }, (_, t) => [text(t * 2 + 1), makeEvent(t * 2 + 2, "result", { status: "completed" }, { chat_id: 1 })]).flat();
  s.loads[0].resolve(detail(chatOf(1, "completed"), turns));
  await settle();
  s.store.markPainted(1);
  handle.release();
  s.advance(SHRINK_AFTER_MS);
  s.frame();
  const log = s.store.log(1);
  assert.equal(log.tail.filter((e) => e.type === "result").length, CHAT_TAIL_TURNS);
  assert.equal(log.hasEarlier, true);
  assert.deepEqual(log.digest.filter((e) => e.type === "result").length, CHAT_TAIL_TURNS + 5);
  // また見たら縮めたまま出す（読み直さない）
  s.store.retain(1, "visible");
  assert.equal(s.loads.length, 1);
});

test("頭のターンを途中から読んだら、描いたあとの手すきにそのターンの頭まで読んで末尾につなぐ（U5）", async () => {
  const s = setup();
  s.store.retain(1, "visible");
  const result = (id: number) => makeEvent(id, "result", { status: "completed" }, { chat_id: 1 });
  // 作業の終わり 4 のあとのターン（5 から）が大きすぎて、8 から読んだ
  s.loads[0].resolve({ ...detail(chatOf(1, "completed"), [text(8), text(9), result(10)]), has_earlier: true, index: [result(2), result(4), text(6)], head_partial: true });
  await settle();
  s.store.markPainted(1);
  assert.equal(s.store.log(1).headPartial, true);
  assert.equal(s.pages.length, 0);
  // 描き終えるまで（手すきまで）読まない
  s.idle();
  assert.deepEqual(s.pages[0].query, { before: 8, since: 5 });
  s.pages[0].resolve({ events: [text(5), text(6), text(7)], has_earlier: true, has_later: false, head_partial: false });
  await settle();
  s.frame();
  assert.equal(s.store.log(1).headPartial, false);
  assert.deepEqual(s.store.log(1).events.map((e) => e.id), [5, 6, 7, 8, 9, 10]);
  s.idle();
  assert.equal(s.pages.length, 1);
});

test("頭のターンを読めなかったら、同じ末尾では読み直さない。見る部品がいなければ読まない", async () => {
  const s = setup();
  const handle = s.store.retain(1, "visible");
  const result = (id: number) => makeEvent(id, "result", { status: "completed" }, { chat_id: 1 });
  s.loads[0].resolve({ ...detail(chatOf(1, "completed"), [text(8), result(9)]), has_earlier: true, index: [result(4)], head_partial: true });
  await settle();
  handle.release();
  s.idle();
  assert.equal(s.pages.length, 0);
  s.store.retain(1, "visible");
  s.idle();
  assert.equal(s.pages.length, 1);
  s.pages[0].reject(new Error("読めない"));
  await settle();
  s.frame();
  s.idle();
  assert.equal(s.pages.length, 1);
  assert.equal(s.store.log(1).headPartial, true);
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

test("先読みしただけのチャットは、見なくなったチャットより先に上限で捨てる。見ているチャットの読み込み中は busy", async () => {
  const s = setup();
  void s.store.prefetch(500);
  s.loads[0].resolve(detail(chatOf(500, "completed")));
  await settle();
  for (let id = 1; id <= WARM_CHATS; id++) {
    const h = s.store.retain(id, "visible");
    assert.equal(s.store.busy(), true);
    s.loads.at(-1)!.resolve(detail(chatOf(id, "completed")));
    await settle();
    s.advance(1);
    h.release();
  }
  assert.equal(s.store.busy(), false);
  assert.equal(s.store.size(), WARM_CHATS);
  assert.equal(s.store.log(500).events.length, 0);
});
