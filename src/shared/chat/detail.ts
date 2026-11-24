// チャットの詳細と記録の読み方の形（GET /api/chats/:chatId・…/events・…/texts・…/transcript のクエリと応答）
import type { Approval } from "./approvalTypes";
import type { ChatEvent } from "./chatEvent";
import type { ChatLive } from "./chatLive";
import type { Chat } from "./types";

/**
 * チャットの詳細（GET /api/chats/:chatId）。作業中の様子 live は SSE の chat_live と同じ形（あとはそれで追いかける）。
 * 記録は、クエリがなければすべて。?after=<記録の ID> ならそれより新しい分だけ（つなぎ直したとき）、?limit=n なら終わりから n 件、
 * ?before=<記録の ID>&limit=n ならそれより前の n 件（さかのぼるとき。どれも古い順）
 */
export interface ChatDetail {
  chat: Chat;
  events: ChatEvent[];
  /** events より前の記録がまだあるか（limit で切ったとき） */
  has_earlier: boolean;
  /** after の記録がもうない（巻き戻しで消えた）。events は空なので、すべて読み直す */
  after_missing: boolean;
  /** このチャットの回答待ち（ツールの承認・AI からの質問・再開するかの確かめ） */
  approvals: Approval[];
  live: ChatLive;
  /**
   * 書きかけの返答（作業中に、確定する前の文。SSE の chat_delta で流した分をつないだもの。なければ null）。
   * 返答の途中で開いても、文の頭から出せるように。このあとに届く chat_delta の offset と比べ、持っている分は足さない
   */
  streaming_text: string | null;
  /** streaming_text の長さ（UTF-16。なければ 0。chat_delta の offset と同じ数え方） */
  streaming_length: number;
  /** tail_turns のときだけ: events より前の記録の索引（@shared/chat/chatIndex の規則で選んで軽くしたもの。古い順） */
  index?: ChatEvent[];
  /** tail_turns のときだけ: 頭のターンが大きすぎて途中から読んだ（残りは画面が手すきのときに読む） */
  head_partial?: boolean;
}

/** チャットの詳細で 1 回に読む記録の数の上限（limit） */
export const CHAT_DETAIL_LIMIT_MAX = 2000;

/** チャットの詳細の記録の読み方（GET /api/chats/:chatId のクエリ。after と before は一緒に使えない） */
export interface ChatDetailQuery {
  after?: number;
  before?: number;
  limit?: number;
  /**
   * 末尾をターン（作業の終わり result を境目に数える）で数えて読み、それより古い記録は索引（index）で返す（パソコンの画面）。
   * after・before・limit とは一緒に使えない
   */
  tail_turns?: number;
}

/** 記録の一部分（GET /api/chats/:chatId/events） */
export interface ChatEventPage {
  /** 読んだ記録（古い順） */
  events: ChatEvent[];
  /** events より前の記録がまだあるか */
  has_earlier: boolean;
  /** events の後ろ（until があればその手前まで）に、まだ読んでいない記録があるか（around・after のとき。ほかは false） */
  has_later: boolean;
  /** 頭のターンが大きすぎて、途中から読んだ（CHAT_TURN_MAX_EVENTS / CHAT_TURN_MAX_BYTES） */
  head_partial: boolean;
}

/**
 * GET /api/chats/:chatId/events のクエリ（どれか 1 つの形）: さかのぼる（before の手前を turns ターン）/ since 以上 before 未満をすべて（頭のターンを埋める・
 * 指定の記録まで読む）/ その記録のターンの前後（遠い所へ移るときの途中の一部分。until の手前まで）/ 途中の一部分から後ろへ（until の手前まで）/
 * サブエージェントの中（parent が parents の中のものと ids の記録。before 未満。parents・ids は , 区切り）
 */
export type ChatEventsQuery =
  | { before: number; turns: number }
  | { before: number; since: number }
  | { around: number; turns: number; until?: number }
  | { after: number; turns: number; until?: number }
  | { parents: string; ids?: string; before: number };

/** チャットの中の検索で読む本文（GET /api/chats/:chatId/texts?before=<記録の ID>）。自分の発言（user）とメインエージェントの返答（parent のない text）だけ、古い順 */
export interface ChatTexts {
  events: ChatEvent[];
}

/** チャットのやり取りの記録（GET /api/chats/:chatId/transcript。自分の発言と AI の返答を古い順に並べた Markdown。右クリックの「全部のやり取りをコピー」） */
export interface ChatTranscript {
  markdown: string;
}

/** 開いたときに読む末尾のターンの数（tail_turns。前を読み足す・途中の一部分を読む 1 回も同じ） */
export const CHAT_TAIL_TURNS = 30;
/** 末尾の大きさの上限（記録の data の長さの合計。超えたらターンを減らす。最新のターンは残す） */
export const CHAT_TAIL_MAX_BYTES = 2_000_000;
/** 1 ターンの記録の数と大きさの上限（超えたら終わりからこの分だけ読み、head_partial にする） */
export const CHAT_TURN_MAX_EVENTS = 2000;
export const CHAT_TURN_MAX_BYTES = 4_000_000;
