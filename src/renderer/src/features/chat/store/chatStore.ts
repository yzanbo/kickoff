import type { Approval, BusEvent, Chat, ChatDetail, ChatDetailQuery, ChatEvent, ChatLive, SubagentInfo } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { streamingAppendOf, streamingEffectOf, type StreamingEffect } from "@shared/chat/streamingRules";
import { detailChatIdOf, detailFromIncrement, detailFromSnapshot, EMPTY_DETAIL, reduceChatDetail, type ChatDetailState } from "./chatDetail";

/*
 * チャットの店（メモの仕様書「0023_表示を軽くする」の M1・分冊 3 の 0-2）。開いているチャットの中身（チャット・記録・回答待ち・作業中の様子・
 * 書いている途中の返答・サブエージェントの途中経過）を、部品の外にチャットごとに 1 つ持つ。同じチャットを何か所（パネルのタブ・右の欄・メモの欄）で
 * 開いても、読み込みと SSE の当て方はここで 1 回。React には依存しない（hook は useChatStore.ts）。
 *
 * 口は用途ごとに分け、部品は要る口だけを購読する:
 * - detail: チャット・回答待ち・作業中の様子・読み込みの失敗（変わることが少ない）
 * - log: 記録と、書いている途中の返答の世代 streamGen（案 4 で末尾・索引・途中の一部分をここに足す）
 * - streaming: 書いている途中の返答（React の state に入れない。少しずつ出す部品が rAF の中で streamText で読む）
 * - progress: サブエージェントの途中経過（SSE の chat_subagent。記録に残らない）
 *
 * 当てた値（working）と部品に見せる値（published）を分ける: 知らせはいつも working に当て、見せる値の差し替えだけを 1 フレームに 1 回にまとめる
 * （rAF。隠れたウィンドウでは rAF が止まるので PUBLISH_FALLBACK_MS で当てる）。開いた直後（中身を初めて見せた・残っていた中身をまた見せた）は、
 * 待たずに 1 回見せてから描き終えるまで（markPainted か OPEN_HOLD_MAX_MS）ためて 1 回で当てる（案 21）。
 *
 * 書いている途中の返答（案 2・6a）: 届いた分はためて、見え方ごとの間隔（STREAM_FLUSH_MS）で当てる。消すとき（確定した返答が記録に入った・
 * 巻き戻し・作業中でなくなった）は途中の文の購読者に知らせず、世代 gen を進めて前の文を retired に残すだけにし、記録の口の差し替えで streamGen を
 * 進める。部品は記録の口から選んだ世代の文を読むので、確定した返答が入る描き直しと途中の文が消える描き直しが同じ 1 回になる
 * （1 フレームだけ二重に見える・両方消えるが起きない）。
 *
 * 見る部品がなくなったチャット（retain が 0）も、WARM_CHATS 件まで中身を残して知らせを当て続ける（戻ったときにすぐ出る。U7 の 10 分で縮めるのは案 4 で作る）。
 * SSE をつなぎ直したら、見ているチャットは持っている最後の記録より後を ?after= で取り直し（巻き戻しで消えていればすべて）、見ていないチャットは
 * 次に見るときに取り直す（stale）
 */

/** 見え方（hidden = パネルの裏のタブ・閉じたパネル） */
export type ChatVisibility = "visible" | "hidden";

/** 書いている途中の返答を当てる間隔（ms）: 見えている所がある / 見えている所がない / ウィンドウが隠れている（メモの仕様書の案 6a） */
export const STREAM_FLUSH_MS = { visible: 33, hidden: 100, windowHidden: 200 } as const;
/** rAF が来ないとき（隠れたウィンドウ）に、見せる値を差し替えるまでの時間 */
export const PUBLISH_FALLBACK_MS = 100;
/** 開いた直後に描き終えの知らせを待つ長さ（来なくても当てる。描けなかったときに止まったままにしない） */
export const OPEN_HOLD_MAX_MS = 3000;
/** 見る部品がなくなっても中身を残すチャットの数（古く見なくなったものから捨てる） */
export const WARM_CHATS = 20;

export interface ChatStoreDeps {
  /** 次の描画の前に呼ぶ（requestAnimationFrame）。返り値で取り消す */
  frame: (fn: () => void) => () => void;
  /** ms のあとに呼ぶ（setTimeout）。返り値で取り消す */
  timer: (fn: () => void, ms: number) => () => void;
  /** いまの時刻（ms） */
  now: () => number;
  /** ウィンドウが隠れているか */
  windowHidden: () => boolean;
  /** チャットの詳細を読む（GET /api/chats/:id） */
  load: (chatId: number, query: ChatDetailQuery) => Promise<ChatDetail>;
}

/** 口 detail の値 */
export interface ChatDetailView {
  /** undefined の間は読み込み中 */
  chat: Chat | undefined;
  approvals: Approval[];
  live: ChatLive;
  /** 読み込みの失敗（中身を一度も読めていないときだけ） */
  error: string | null;
}

/** 口 log の値（記録。案 4 で、読み込んだ範囲（末尾・途中の一部分）と索引をここに足す） */
export interface ChatLogView {
  events: ChatEvent[];
  /** 書いている途中の返答の世代（消すたびに進む。この世代の文を streamText で読む） */
  streamGen: number;
}

/** 口 progress の値（サブエージェントの途中経過と、届いた時刻。作業 ID ごと） */
export interface ChatProgressView {
  progress: Record<string, SubagentInfo>;
  progressAt: Record<string, string>;
}

type Channel = "detail" | "log" | "progress" | "streaming";
type Published = Exclude<Channel, "streaming">;

interface StreamState {
  gen: number;
  /** いまの世代の文（当てた分） */
  text: string;
  /** まだ当てていない分（次の間隔で足す） */
  pending: string;
  /** 部品に見せている世代の、消す前の文（記録の口が差し替わるまで同じ文を返す） */
  retired: { gen: number; text: string } | null;
  /** 最後に届いた時刻（作業中の行の「動きがない」の目安） */
  lastAt: string | null;
  cancel: (() => void) | null;
}

interface Entry {
  chatId: number;
  detail: ChatDetailState;
  error: string | null;
  progress: ChatProgressView;
  stream: StreamState;
  /** 読み込みの最中に届いた知らせ（読み込み中でなければ null。届いた中身に当て直す） */
  replay: BusEvent[] | null;
  /** 読み込みの番号（違う応答は捨てる） */
  request: number;
  /** 見ている部品と見え方 */
  viewers: Map<symbol, ChatVisibility>;
  /** 見る部品がなくなった時刻（捨てる順） */
  releasedAt: number;
  /** 見ていない間に SSE をつなぎ直した（次に見るときに取り直す） */
  stale: boolean;
  /** 中身を部品に見せたか */
  shown: boolean;
  published: { detail: ChatDetailView; log: ChatLogView; progress: ChatProgressView };
  dirty: Set<Published>;
  cancelPublish: (() => void) | null;
  /** 開いた直後で、描き終えるまでためている（取り消すと待つのをやめる） */
  hold: (() => void) | null;
}

const EMPTY_VIEW: ChatDetailView = { chat: undefined, approvals: [], live: EMPTY_DETAIL.live, error: null };
const EMPTY_LOG: ChatLogView = { events: [], streamGen: 0 };
const EMPTY_PROGRESS: ChatProgressView = { progress: {}, progressAt: {} };

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
      viewers: new Map(),
      releasedAt: deps.now(),
      stale: false,
      shown: false,
      published: { detail: EMPTY_VIEW, log: EMPTY_LOG, progress: EMPTY_PROGRESS },
      dirty: new Set(),
      cancelPublish: null,
      hold: null,
    };
    entries.set(chatId, entry);
    return entry;
  };

  // ---- 見せる値の差し替え（1 フレームに 1 回・開いた直後はためる） ----

  const publish = (e: Entry) => {
    e.cancelPublish?.();
    e.cancelPublish = null;
    const dirty = [...e.dirty];
    e.dirty.clear();
    for (const channel of dirty) {
      if (channel === "detail") e.published.detail = { chat: e.detail.chat, approvals: e.detail.approvals, live: e.detail.live, error: e.error };
      else if (channel === "log") e.published.log = { events: e.detail.events, streamGen: e.stream.gen };
      else e.published.progress = e.progress;
    }
    for (const channel of dirty) notify(e.chatId, channel);
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

  // ---- 書いている途中の返答 ----

  const flushInterval = (e: Entry) =>
    deps.windowHidden() ? STREAM_FLUSH_MS.windowHidden : [...e.viewers.values()].includes("visible") ? STREAM_FLUSH_MS.visible : STREAM_FLUSH_MS.hidden;

  const flushStream = (e: Entry) => {
    const s = e.stream;
    s.cancel?.();
    s.cancel = null;
    if (!s.pending) return;
    s.text += s.pending;
    s.pending = "";
    notify(e.chatId, "streaming");
  };

  /** 消す（世代を進める）。部品に見せている世代の文は retired に残し、記録の口の差し替えで streamGen を進める */
  const clearStream = (e: Entry) => {
    const s = e.stream;
    s.cancel?.();
    s.cancel = null;
    s.pending = "";
    if (!s.text) return;
    if (e.published.log.streamGen === s.gen) s.retired = { gen: s.gen, text: s.text };
    s.gen++;
    s.text = "";
    mark(e, "log");
  };

  const applyStream = (e: Entry, effect: StreamingEffect) => {
    if (effect.effect === "clear") return clearStream(e);
    const s = e.stream;
    const add = streamingAppendOf(s.text.length + s.pending.length, effect.text, effect.offset);
    if (!add) return;
    s.pending += add;
    s.lastAt = new Date(deps.now()).toISOString();
    s.cancel ??= deps.timer(() => flushStream(e), flushInterval(e));
  };

  /** 詳細の書きかけの返答から始め、読み込みの最中に届いた知らせを当て直す（詳細の文に入っている分は offset で捨てる） */
  const seedStream = (e: Entry, text: string | null, missed: readonly BusEvent[]) => {
    const s = e.stream;
    if (text === null || !text.startsWith(s.text)) clearStream(e);
    if (text) {
      s.cancel?.();
      s.cancel = null;
      s.text = text;
      s.pending = "";
    }
    for (const event of missed) {
      const effect = streamingEffectOf(event);
      if (effect?.chatId === e.chatId) applyStream(e, effect);
    }
    flushStream(e);
    notify(e.chatId, "streaming");
  };

  // ---- 読み込み ----

  /** 当てたあとの中身と前の中身を比べ、変わった口を差し替えの予約に入れる */
  const changed = (e: Entry, prev: ChatDetailState) => {
    if (prev.chat !== e.detail.chat || prev.approvals !== e.detail.approvals || prev.live !== e.detail.live) mark(e, "detail");
    if (prev.events !== e.detail.events) mark(e, "log");
  };

  /** 読む（all: 持っている記録があっても、すべて読み直す） */
  const load = (e: Entry, all = false) => {
    const id = ++e.request;
    e.replay = [];
    e.stale = false;
    const last = all || !e.detail.chat ? undefined : e.detail.events.at(-1)?.id;
    const alive = () => e.request === id && entries.get(e.chatId) === e;
    deps
      .load(e.chatId, last === undefined ? {} : { after: last })
      .then((d) => {
        if (!alive()) return;
        // 持っていた最後の記録が巻き戻しで消えていたら、すべて読み直す
        if (d.after_missing) return load(e, true);
        const missed = e.replay ?? [];
        e.replay = null;
        const prev = e.detail;
        e.detail = last === undefined ? detailFromSnapshot(d, missed, e.chatId, prev) : detailFromIncrement(d, missed, e.chatId, prev);
        if (e.error !== null) mark(e, "detail");
        e.error = null;
        // 書きかけの返答を持たない前の版のコア（起動したままのコア）は streaming_text を返さない
        seedStream(e, d.chat.status === "running" ? (d.streaming_text ?? null) : null, missed);
        changed(e, prev);
        if (!e.shown) showNow(e);
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
      e.stream.cancel?.();
      e.hold?.();
      entries.delete(e.chatId);
    }
  };

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
      if (e.replay === null && (!e.detail.chat || e.stale)) load(e);
      if (first && e.shown) showNow(e);
      if (visibility === "visible") flushStream(e);
      return {
        setVisibility(next: ChatVisibility) {
          if (!e.viewers.has(key)) return;
          e.viewers.set(key, next);
          if (next === "visible") flushStream(e);
        },
        release() {
          if (!e.viewers.delete(key) || e.viewers.size > 0) return;
          e.releasedAt = deps.now();
          trim();
        },
      };
    },

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
      if (effect) applyStream(e, effect);
      if (event.type === "chat_delta") return;
      const prev = e.detail;
      e.detail = reduceChatDetail(prev, event, e.chatId);
      changed(e, prev);
    },

    /** SSE をつなぎ直した: 見ているチャットは取り直し、見ていないチャットは次に見るときに取り直す */
    reconnected() {
      for (const e of entries.values()) {
        if (e.viewers.size > 0) load(e);
        else e.stale = true;
      }
    },

    /** ウィンドウが表に出た: ためた途中の文をすぐ当てる */
    windowShown() {
      for (const e of entries.values()) flushStream(e);
    },

    /** チャットの画面が描き終えた: 開いた直後にためていた知らせを 1 回で当てる */
    markPainted(chatId: number) {
      const e = entries.get(chatId);
      if (!e?.hold) return;
      e.hold();
      if (e.dirty.size > 0) publish(e);
    },

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

