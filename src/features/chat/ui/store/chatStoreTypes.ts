// チャットの店（chatStore.ts）の口の形・定数・チャットごとの入れ物（店の中と hook・テストで使う）
import type { Approval, Chat, ChatDetail, ChatDetailQuery, ChatEvent, ChatEventPage, ChatEventsQuery, ChatLive, SubagentInfo } from "@shared/types";
import type { BusEvent } from "@shared/foundation/contract";
import { EMPTY_DETAIL, type ChatDetailState } from "./chatDetail";

/** 見え方（hidden = パネルの裏のタブ・閉じたパネル） */
export type ChatVisibility = "visible" | "hidden";

/** 書いている途中の返答を当てる間隔（ms）: 見えている所がある / 見えている所がない / ウィンドウが隠れている */
export const STREAM_FLUSH_MS = { visible: 33, hidden: 100, windowHidden: 200 } as const;
/** rAF が来ないとき（隠れたウィンドウ）に、見せる値を差し替えるまでの時間 */
export const PUBLISH_FALLBACK_MS = 100;
/** 開いた直後に描き終えの知らせを待つ長さ（来なくても当てる。描けなかったときに止まったままにしない） */
export const OPEN_HOLD_MAX_MS = 3000;
/** 見る部品がなくなっても中身を残すチャットの数（古く見なくなったものから捨てる） */
export const WARM_CHATS = 20;
/** 見る部品がなくなってから、末尾を縮めるまでの時間 */
export const SHRINK_AFTER_MS = 10 * 60_000;
/** 頭のターンを途中から読んだとき、描いたあとの手すきを待つ長さの上限（来なければこの時間で読む） */
export const HEAD_FILL_IDLE_MS = 1000;

export interface ChatStoreDeps {
  /** 次の描画の前に呼ぶ（requestAnimationFrame）。返り値で取り消す */
  frame: (fn: () => void) => () => void;
  /** 手すきのときに呼ぶ（requestIdleCallback。来なくても timeout ms で呼ぶ）。返り値で取り消す */
  idle: (fn: () => void, timeout: number) => () => void;
  /** ms のあとに呼ぶ（setTimeout）。返り値で取り消す */
  timer: (fn: () => void, ms: number) => () => void;
  /** いまの時刻（ms） */
  now: () => number;
  /** ウィンドウが隠れているか */
  windowHidden: () => boolean;
  /** チャットの詳細を読む（GET /api/chats/:id） */
  load: (chatId: number, query: ChatDetailQuery) => Promise<ChatDetail>;
  /** 記録の一部分を読む（GET /api/chats/:id/events） */
  page: (chatId: number, query: ChatEventsQuery) => Promise<ChatEventPage>;
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

/** 口 log の値（記録。読み込んだ範囲は chatLog.ts） */
export interface ChatLogView {
  /** 流れに出す記録（途中の一部分を読んでいればそれ、なければ末尾） */
  events: ChatEvent[];
  /** 末尾（最新のターンから終わりまで。作業中の行・既読・一番下へ戻るボタンが読む） */
  tail: ChatEvent[];
  /** 記録全体から作るものに渡す記録（索引・途中の一部分・サブエージェントの中・末尾を重ねたもの） */
  digest: ChatEvent[];
  /** 中身のまま読んだ記録（サブエージェントのカード・動き） */
  loaded: ChatEvent[];
  /** 流れに出す記録より前の、記録全体から作るものに要る記録（流れの項目の組み立てに渡す） */
  preface: readonly ChatEvent[];
  /** 末尾の始まりの記録の ID（0 = 最初から読んでいる。チャットの中の検索の本文をこれより前で読む） */
  tailStart: number;
  /** 流れに出す記録より前に、まだ読んでいない記録があるか */
  hasEarlier: boolean;
  /** 途中の一部分を出しているか（下に末尾がある） */
  focused: boolean;
  /** 流れの最初の作業の頭を読んでいない */
  headPartial: boolean;
  /** 前・後ろ・遠い所を読んでいる最中か */
  paging: boolean;
  /** 書いている途中の返答の世代（消すたびに進む。この世代の文を streamText で読む） */
  streamGen: number;
}

/** 口 progress の値（サブエージェントの途中経過と、届いた時刻。作業 ID ごと） */
export interface ChatProgressView {
  progress: Record<string, SubagentInfo>;
  progressAt: Record<string, string>;
}

export type Channel = "detail" | "log" | "progress" | "streaming";
export type Published = Exclude<Channel, "streaming">;

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

export interface Entry {
  chatId: number;
  detail: ChatDetailState;
  error: string | null;
  progress: ChatProgressView;
  stream: StreamState;
  /** 読み込みの最中に届いた知らせ（読み込み中でなければ null。届いた中身に当て直す） */
  replay: BusEvent[] | null;
  /** 読み込みの番号（違う応答は捨てる） */
  request: number;
  /** すべて読み直した回数（前の中身に対して頼んだ一部分の答えは捨てる） */
  epoch: number;
  /** 記録の一部分を読んでいる最中（1 つずつ） */
  paging: Promise<void> | null;
  /** 見ている部品と見え方 */
  viewers: Map<symbol, ChatVisibility>;
  /** 見る部品がなくなった時刻（捨てる順） */
  releasedAt: number;
  /** 見る部品がなくなってから末尾を縮めるタイマー */
  cancelShrink: (() => void) | null;
  /** 見ていない間に SSE をつなぎ直した（次に見るときに取り直す） */
  stale: boolean;
  /** 中身を部品に見せたか */
  shown: boolean;
  published: { detail: ChatDetailView; log: ChatLogView; progress: ChatProgressView };
  dirty: Set<Published>;
  cancelPublish: (() => void) | null;
  /** 開いた直後で、描き終えるまでためている（取り消すと待つのをやめる） */
  hold: (() => void) | null;
  /** 頭のターンを埋める読み込みの予約（手すきのとき） */
  cancelFill: (() => void) | null;
  /** 頭のターンを埋めようとした末尾の始まり（読めなかったとき、同じ所で何度も読み直さない） */
  fillTriedAt: number | null;
}

export const EMPTY_VIEW: ChatDetailView = { chat: undefined, approvals: [], live: EMPTY_DETAIL.live, error: null };
export const EMPTY_LOG: ChatLogView = {
  events: [],
  tail: [],
  digest: [],
  loaded: [],
  preface: [],
  tailStart: 0,
  hasEarlier: false,
  focused: false,
  headPartial: false,
  paging: false,
  streamGen: 0,
};
export const EMPTY_PROGRESS: ChatProgressView = { progress: {}, progressAt: {} };
