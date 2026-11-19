import { CHAT_TAIL_TURNS, type BusEvent } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { streamingEffectOf } from "@shared/chat/streamingRules";
import { detailChatIdOf, detailFromIncrement, detailFromSnapshot, EMPTY_DETAIL, reduceChatDetail, type ChatDetailState } from "./chatDetail";
import { digestOf, loadedOf, prefaceOf, type LogRange } from "./chatLog";
import { createPaging } from "./chatPaging";
import { createStreamOps } from "./chatStream";
import {
  EMPTY_LOG,
  EMPTY_PROGRESS,
  EMPTY_VIEW,
  HEAD_FILL_IDLE_MS,
  OPEN_HOLD_MAX_MS,
  PUBLISH_FALLBACK_MS,
  SHRINK_AFTER_MS,
  WARM_CHATS,
  type Channel,
  type ChatDetailView,
  type ChatLogView,
  type ChatProgressView,
  type ChatStoreDeps,
  type ChatVisibility,
  type Entry,
  type Published,
} from "./chatStoreTypes";

export { STREAM_FLUSH_MS, PUBLISH_FALLBACK_MS, OPEN_HOLD_MAX_MS, WARM_CHATS, SHRINK_AFTER_MS } from "./chatStoreTypes";
export type { ChatVisibility, ChatStoreDeps, ChatDetailView, ChatLogView, ChatProgressView } from "./chatStoreTypes";

/*
 * チャットの店（メモの仕様書「0023_表示を軽くする」の M1・案 4・分冊 3 の 0-2 / 1-4）。開いているチャットの中身（チャット・記録・回答待ち・作業中の様子・
 * 書いている途中の返答・サブエージェントの途中経過）を、部品の外にチャットごとに 1 つ持つ。同じチャットを何か所（パネルのタブ・右の欄・メモの欄）で
 * 開いても、読み込みと SSE の当て方はここで 1 回。React には依存しない（hook は useChatStore.ts）。
 *
 * 口は用途ごとに分け、部品は要る口だけを購読する:
 * - detail: チャット・回答待ち・作業中の様子・読み込みの失敗（変わることが少ない）
 * - log: 記録（流れに出す記録・末尾・記録全体から作るものに渡す digest など。chatLog.ts）と、書いている途中の返答の世代 streamGen
 * - streaming: 書いている途中の返答（React の state に入れない。少しずつ出す部品が rAF の中で streamText で読む。chatStream.ts）
 * - progress: サブエージェントの途中経過（SSE の chat_subagent。記録に残らない）
 *
 * 記録は開くとき末尾（最新 CHAT_TAIL_TURNS ターン）だけを読み、その前は索引で受ける（案 4）。前を読み足す・遠い所を読む（途中の一部分）・
 * サブエージェントの中を読むのは loadEarlier / loadLater / openAround / loadScope（chatPaging.ts）。末尾より前で巻き戻したら読み直す。
 *
 * 当てた値（working）と部品に見せる値（published）を分ける: 知らせはいつも working に当て、見せる値の差し替えだけを 1 フレームに 1 回にまとめる
 * （rAF。隠れたウィンドウでは rAF が止まるので PUBLISH_FALLBACK_MS で当てる）。開いた直後（中身を初めて見せた・残っていた中身をまた見せた）は、
 * 待たずに 1 回見せてから描き終えるまで（markPainted か OPEN_HOLD_MAX_MS）ためて 1 回で当てる（案 21）。
 *
 * 見る部品がなくなったチャット（retain が 0）も、WARM_CHATS 件まで中身を残して知らせを当て続け、SHRINK_AFTER_MS たったら末尾を最新
 * CHAT_TAIL_TURNS ターンに縮める（U7）。SSE をつなぎ直したら、見ているチャットは持っている最後の記録より後を ?after= で取り直し
 * （巻き戻しで消えていれば末尾から読み直す）、見ていないチャットは次に見るときに取り直す（stale）
 */

/** チャットの店を作る（アプリでは useChatStore.ts の 1 つだけ。テストは偽の frame・timer・時計・読み込みで作る） */
export function createChatStore(deps: ChatStoreDeps) {
  const entries = new Map<number, Entry>();
  const listeners = new Map<number, Record<Channel, Set<() => void>>>();

  const notify = (chatId: number, channel: Channel) => {
    for (const l of [...(listeners.get(chatId)?.[channel] ?? [])]) l();
  };

  const create = (chatId: number): Entry => {
    const entry: Entry = {
      chatId,
      detail: EMPTY_DETAIL,
      error: null,
      progress: EMPTY_PROGRESS,
      stream: { gen: 0, text: "", pending: "", retired: null, lastAt: null, cancel: null },
      replay: null,
      request: 0,
      epoch: 0,
      paging: null,
      viewers: new Map(),
      releasedAt: deps.now(),
      cancelShrink: null,
      stale: false,
      shown: false,
      published: { detail: EMPTY_VIEW, log: EMPTY_LOG, progress: EMPTY_PROGRESS },
      dirty: new Set(),
      cancelPublish: null,
      hold: null,
      cancelFill: null,
      fillTriedAt: null,
    };
    entries.set(chatId, entry);
    return entry;
  };

  // ---- 見せる値の差し替え（1 フレームに 1 回・開いた直後はためる） ----

  /** 口 log の値（前の値と範囲・頭が同じなら、流れの項目に渡す preface は同じものを使う） */
  const logView = (e: Entry): ChatLogView => {
    const { events: tail, range } = e.detail;
    const prev = e.published.log;
    const events = range.focus?.events ?? tail;
    const sameRange = prevRange.get(e) === range;
    prevRange.set(e, range);
    return {
      events,
      tail,
      digest: digestOf(range, tail),
      loaded: loadedOf(range, tail),
      preface: sameRange && prev.events[0]?.id === events[0]?.id ? prev.preface : prefaceOf(range, tail),
      tailStart: range.tailStart,
      hasEarlier: range.focus ? range.focus.hasEarlier : range.hasEarlier,
      focused: range.focus !== null,
      headPartial: range.focus === null && range.headPartial,
      paging: e.paging !== null,
      streamGen: e.stream.gen,
    };
  };
  const prevRange = new WeakMap<Entry, LogRange>();

  const publish = (e: Entry) => {
    e.cancelPublish?.();
    e.cancelPublish = null;
    const dirty = [...e.dirty];
    e.dirty.clear();
    for (const channel of dirty) {
      if (channel === "detail") e.published.detail = { chat: e.detail.chat, approvals: e.detail.approvals, live: e.detail.live, error: e.error };
      else if (channel === "log") e.published.log = logView(e);
      else e.published.progress = e.progress;
    }
    for (const channel of dirty) notify(e.chatId, channel);
    if (dirty.includes("log")) scheduleFill(e);
  };

  /**
   * 頭のターンを途中から読んで見せている（U5）なら、描いたあとの手すきのときにそのターンの頭まで読む（見ている部品があるときだけ。
   * 読めなかったら同じ末尾では読み直さない。次に末尾が変わった・読み直したときにまた読む）
   */
  const scheduleFill = (e: Entry) => {
    const { range } = e.detail;
    if (e.cancelFill || !e.published.log.headPartial || e.viewers.size === 0 || e.paging || e.fillTriedAt === range.tailStart) return;
    e.cancelFill = deps.idle(() => {
      e.cancelFill = null;
      if (entries.get(e.chatId) !== e || e.viewers.size === 0 || !e.published.log.headPartial) return;
      e.fillTriedAt = e.detail.range.tailStart;
      void paging.fillHead(e.chatId);
    }, HEAD_FILL_IDLE_MS);
  };

  const schedulePublish = (e: Entry) => {
    if (e.cancelPublish || e.hold) return;
    const run = () => publish(e);
    const cancelFrame = deps.frame(run);
    const cancelTimer = deps.timer(run, PUBLISH_FALLBACK_MS);
    e.cancelPublish = () => {
      cancelFrame();
      cancelTimer();
    };
  };

  const mark = (e: Entry, channel: Published) => {
    e.dirty.add(channel);
    schedulePublish(e);
  };

  /** 中身を見せる（ためた分を待たずに当てる）。そのあとは描き終えるまでためる */
  const showNow = (e: Entry) => {
    e.shown = true;
    publish(e);
    e.hold?.();
    const cancel = deps.timer(() => release(), OPEN_HOLD_MAX_MS);
    const release = () => {
      e.hold = null;
      if (e.dirty.size > 0) publish(e);
    };
    e.hold = () => {
      cancel();
      e.hold = null;
    };
  };

  const stream = createStreamOps(
    deps,
    (e) => notify(e.chatId, "streaming"),
    (e) => mark(e, "log"),
  );

  // ---- 読み込み ----

  /** 当てたあとの中身と前の中身を比べ、変わった口を差し替えの予約に入れる */
  const changed = (e: Entry, prev: ChatDetailState) => {
    if (prev.chat !== e.detail.chat || prev.approvals !== e.detail.approvals || prev.live !== e.detail.live) mark(e, "detail");
    if (prev.events !== e.detail.events || prev.range !== e.detail.range) mark(e, "log");
  };

  /** 読む（all: 持っている記録があっても、末尾から読み直す）。読み終えたら（読めなくても）解決する */
  const load = (e: Entry, all = false): Promise<void> => {
    const id = ++e.request;
    e.replay = [];
    e.stale = false;
    const last = all || !e.detail.chat ? undefined : e.detail.events.at(-1)?.id;
    const alive = () => e.request === id && entries.get(e.chatId) === e;
    return deps
      .load(e.chatId, last === undefined ? { tail_turns: CHAT_TAIL_TURNS } : { after: last })
      .then((d): Promise<void> | undefined => {
        if (!alive()) return;
        // 持っていた最後の記録が巻き戻しで消えていたら、末尾から読み直す
        if (d.after_missing) return load(e, true);
        const missed = e.replay ?? [];
        e.replay = null;
        const prev = e.detail;
        if (last === undefined) {
          e.epoch++;
          e.fillTriedAt = null;
        }
        e.detail = last === undefined ? detailFromSnapshot(d, missed, e.chatId, prev) : detailFromIncrement(d, missed, e.chatId, prev);
        if (e.error !== null) mark(e, "detail");
        e.error = null;
        stream.seed(e, d.chat.status === "running" ? d.streaming_text : null, missed);
        changed(e, prev);
        if (e.shown) return;
        if (e.viewers.size > 0) showNow(e);
        else {
          // 先読み（見る部品がいない）: 見せる値だけ作っておき、開いたときに retain が見せてから描き終えるまでためる
          e.shown = true;
          publish(e);
        }
      })
      .catch((err: unknown) => {
        if (!alive()) return;
        e.replay = null;
        // 中身を一度も読めていなければ失敗を出す。取り直しの失敗は前の中身を出したまま（次につながったときにまた取り直す）
        if (e.detail.chat) return;
        e.error = errorMessage(err);
        e.dirty.add("detail");
        publish(e);
      });
  };

  /** 見る部品のないチャットを、新しく見なくなった順に WARM_CHATS 件まで残して捨てる */
  const trim = () => {
    const idle = [...entries.values()].filter((e) => e.viewers.size === 0).sort((a, b) => b.releasedAt - a.releasedAt);
    for (const e of idle.slice(WARM_CHATS)) {
      e.cancelPublish?.();
      e.cancelFill?.();
      e.cancelShrink?.();
      e.stream.cancel?.();
      e.hold?.();
      entries.delete(e.chatId);
    }
  };

  // 記録の読み足し（前を読む・途中の一部分・サブエージェントの中）と、見ていない間に縮める shrink
  const { shrink, ...paging } = createPaging({ entries, page: deps.page, mark: (e) => mark(e, "log") });

  return {
    /**
     * チャットを見る（中身がなければ読み、見る部品がなくなっても捨てずに残す）。返り値で見え方を変える・やめる。
     * 見る部品がいなかったチャットに中身があれば、待たずに見せてから描き終えるまで知らせをためる（案 21）
     */
    retain(chatId: number, visibility: ChatVisibility) {
      const e = entries.get(chatId) ?? create(chatId);
      const key = Symbol(chatId);
      const first = e.viewers.size === 0;
      e.viewers.set(key, visibility);
      e.cancelShrink?.();
      e.cancelShrink = null;
      if (e.replay === null && (!e.detail.chat || e.stale)) void load(e);
      if (first && e.shown) showNow(e);
      scheduleFill(e);
      if (visibility === "visible") stream.flush(e);
      return {
        setVisibility(next: ChatVisibility) {
          if (!e.viewers.has(key)) return;
          e.viewers.set(key, next);
          if (next === "visible") stream.flush(e);
        },
        release() {
          if (!e.viewers.delete(key) || e.viewers.size > 0) return;
          e.releasedAt = deps.now();
          e.cancelShrink = deps.timer(() => shrink(e), SHRINK_AFTER_MS);
          trim();
        },
      };
    },

    /**
     * チャットを先読みする（見る部品は増やさない。メモの仕様書「0023_表示を軽くする」の案 4・分冊 3 の 1-4-7）。中身がなければ末尾と索引を読み、
     * 見ていない間につなぎ直していれば取り直す。読み終えたら（読めなくても・もう持っていれば すぐ）解決する。先読みしただけのチャットは、
     * 一度も見ていないものとして、見なくなったチャットより先に WARM_CHATS の上限で捨てる
     */
    prefetch(chatId: number): Promise<void> {
      const existing = entries.get(chatId);
      if (existing) {
        if (existing.viewers.size === 0 && existing.replay === null && existing.stale) return load(existing);
        return Promise.resolve();
      }
      const e = create(chatId);
      e.releasedAt = 0;
      const run = load(e);
      trim();
      return run;
    },

    /** 見ているチャットのどれかを読み込んでいる最中か（先読みは表のチャットの読み込みを待つ） */
    busy: (): boolean => [...entries.values()].some((e) => e.viewers.size > 0 && (e.replay !== null || e.paging !== null)),

    /** サーバーの知らせを当てる（店にあるチャットのものだけ。見る部品がなくても当てる） */
    apply(event: BusEvent) {
      if (event.type === "chat_subagent") {
        const e = entries.get(event.chat_id);
        if (!e) return;
        // 作業 ID ごとに覚える（再開すると呼び出し ID が変わるため。行へのまとめ方は collectSubagents が決める）
        const at = new Date(deps.now()).toISOString();
        e.progress = { progress: { ...e.progress.progress, [event.subagent.task_id]: event.subagent }, progressAt: { ...e.progress.progressAt, [event.subagent.task_id]: at } };
        mark(e, "progress");
        return;
      }
      // 書いている途中の返答を足す・消す（スマホ・コアと同じ決まり）。中身を読む前は、読めたあとに当て直す分として積むだけ
      const effect = streamingEffectOf(event);
      const id = effect?.chatId ?? detailChatIdOf(event);
      const e = id === null ? undefined : entries.get(id);
      if (!e) return;
      e.replay?.push(event);
      if (!e.detail.chat) return;
      // 途中の文を先に消してから記録を足す（同じ差し替えで、確定した返答が入り途中の文が消える）
      if (effect) stream.apply(e, effect);
      if (event.type === "chat_delta") return;
      // 末尾より前で巻き戻した: 索引が作り直しになるので、末尾から読み直す
      if (event.type === "chat_events_deleted" && e.detail.range.tailStart > 0 && event.from_event_id < e.detail.range.tailStart && e.replay === null) {
        void load(e, true);
        return;
      }
      const prev = e.detail;
      e.detail = reduceChatDetail(prev, event, e.chatId);
      changed(e, prev);
    },

    /** SSE をつなぎ直した: 見ているチャットは取り直し、見ていないチャットは次に見るときに取り直す */
    reconnected() {
      for (const e of entries.values()) {
        if (e.viewers.size > 0) void load(e);
        else e.stale = true;
      }
    },

    /** ウィンドウが表に出た: ためた途中の文をすぐ当てる */
    windowShown() {
      for (const e of entries.values()) stream.flush(e);
    },

    /** チャットの画面が描き終えた: 開いた直後にためていた知らせを 1 回で当てる */
    markPainted(chatId: number) {
      const e = entries.get(chatId);
      if (!e?.hold) return;
      e.hold();
      if (e.dirty.size > 0) publish(e);
    },

    ...paging,

    detail: (chatId: number): ChatDetailView => entries.get(chatId)?.published.detail ?? EMPTY_VIEW,
    log: (chatId: number): ChatLogView => entries.get(chatId)?.published.log ?? EMPTY_LOG,
    progress: (chatId: number): ChatProgressView => entries.get(chatId)?.published.progress ?? EMPTY_PROGRESS,

    /** 書いている途中の返答の、その世代の文（いまの世代なら当てた分、部品に見せている前の世代なら消す前の文、ほかは ""） */
    streamText(chatId: number, gen: number): string {
      const s = entries.get(chatId)?.stream;
      if (!s) return "";
      if (s.gen === gen) return s.text;
      return s.retired?.gen === gen ? s.retired.text : "";
    },

    /** 書いている途中の返答が最後に届いた時刻（ISO。届いていなければ null） */
    streamLastAt: (chatId: number): string | null => entries.get(chatId)?.stream.lastAt ?? null,

    /** 口の変化を購読する（チャットの中身を捨てても、購読はそのまま） */
    subscribe(chatId: number, channel: Channel, listener: () => void): () => void {
      let sets = listeners.get(chatId);
      if (!sets) {
        sets = { detail: new Set(), log: new Set(), progress: new Set(), streaming: new Set() };
        listeners.set(chatId, sets);
      }
      const set = sets[channel];
      set.add(listener);
      return () => {
        set.delete(listener);
        const all = listeners.get(chatId);
        if (all && Object.values(all).every((s) => s.size === 0)) listeners.delete(chatId);
      };
    },

    /** 中身を持っているチャットの数（テストと診断） */
    size: () => entries.size,
  };
}
