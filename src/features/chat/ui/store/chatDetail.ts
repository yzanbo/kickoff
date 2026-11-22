// 1 つのチャットの中身（記録・作業中の様子）を、サーバーの知らせで直す決まり（純粋関数。チャットの店 chatStore.ts が使う）。
// チャット自身（名前・状態）は持たない（知っているチャット knownChats.ts を正にする。詳細の応答のチャットは chatAfter で当て直してから入れる）。
// 回答待ちも持たない（回答待ちの店 approvals.ts を正にする。詳細の応答の approvals は使わない）
import type { ChatEvent } from "@shared/chat/chatEvent";
import { EMPTY_CHAT_LIVE, type ChatLive } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import type { ChatDetail } from "@shared/chat/detail";
import type { BusEvent } from "@shared/foundation/contract";
import { deleteFrom, EMPTY_RANGE, rangeFromDetail, type LogRange } from "./chatLog";

/** 画面が持つチャットの中身 */
export interface ChatDetailState {
  /** 記録の末尾（開いたときに読んだ最新のターンから終わりまで。SSE の記録はここに足す） */
  events: ChatEvent[];
  /** 末尾のほかに読んだもの（索引・途中の一部分・サブエージェントの中。chatLog.ts） */
  range: LogRange;
  live: ChatLive;
}

/** 読み込む前の中身（作業中の様子は何も起きていないもの） */
export const EMPTY_DETAIL: ChatDetailState = { events: [], range: EMPTY_RANGE, live: EMPTY_CHAT_LIVE };

/**
 * 届いた作業中の様子のうち、中身の変わっていないものは前のものを使う（chat_live はどれかが変わるたびに丸ごと届くので、
 * 裏の作業などを見て記録をたどる計算（サブエージェントの一覧 chatSelectors など）を、変わっていないのにやり直さないため）
 */
function keepUnchanged(prev: ChatLive, next: ChatLive): ChatLive {
  const keep = <T,>(a: T, b: T): T => (JSON.stringify(a) === JSON.stringify(b) ? a : b);
  return {
    queue: keep(prev.queue, next.queue),
    background: keep(prev.background, next.background),
    retry: keep(prev.retry, next.retry),
    reconnect: keep(prev.reconnect, next.reconnect),
    compacting: next.compacting,
    stopping: next.stopping,
    drawing_visual: next.drawing_visual,
    after_compact: keep(prev.after_compact, next.after_compact),
    awaiting_compact: next.awaiting_compact,
    compact_after_turn: next.compact_after_turn,
    compacted_turn: next.compacted_turn,
    tells_closed: next.tells_closed,
    inheriting: next.inheriting,
    restart_resume: keep(prev.restart_resume, next.restart_resume),
    workplace_move: keep(prev.workplace_move, next.workplace_move),
    phase: next.phase,
    status: next.status,
    provider_handoff: keep(prev.provider_handoff, next.provider_handoff),
    preparing_for: next.preparing_for,
    compact_by: next.compact_by,
    hold: next.hold,
    now: keep(prev.now, next.now),
    turn_end: keep(prev.turn_end, next.turn_end),
  };
}

/** チャットの店（chatStore.ts の apply）が当てる SSE の種類（下の detailChatIdOf の種類・途中の文 streamingEffectOf・サブエージェントの進み具合） */
export const CHAT_STORE_EVENTS = ["chat", "chat_event", "chat_events_deleted", "chat_live", "chat_delta", "chat_subagent"] as const;

/** 中身を変える知らせなら、そのチャットの ID（ほかの知らせは null。書いている途中の返答 chat_delta は別に扱うので含めない） */
export function detailChatIdOf(event: BusEvent): number | null {
  switch (event.type) {
    case "chat":
      return event.chat.id;
    case "chat_event":
      return event.event.chat_id;
    case "chat_events_deleted":
    case "chat_live":
      return event.chat_id;
    default:
      return null;
  }
}

/**
 * 知らせで中身を直す（このチャットのものでなければ、そのまま返す）。同じ知らせを 2 回当てても同じになる
 * （記録は ID で重ねない）ので、読み込みの最中に届いた知らせを、届いた中身にもう一度当てられる
 */
export function reduceChatDetail(state: ChatDetailState, event: BusEvent, chatId: number): ChatDetailState {
  if (detailChatIdOf(event) !== chatId) return state;
  switch (event.type) {
    case "chat_event": {
      // 記録は ID の順に届く。いちばん新しいものより前の ID なら、もう持っているかを確かめる
      const last = state.events.at(-1);
      if (last && event.event.id <= last.id && state.events.some((x) => x.id === event.event.id)) return state;
      return { ...state, events: [...state.events, event.event] };
    }
    case "chat_events_deleted": {
      // 巻き戻した: その発言から後ろを画面の記録からも消す（末尾より前で消したときは、店が読み直す）
      const events = state.events.filter((x) => x.id < event.from_event_id);
      const range = deleteFrom(state.range, event.from_event_id);
      return events.length === state.events.length && range.focus === state.range.focus && range.index.length === state.range.index.length ? state : { ...state, events, range };
    }
    case "chat_live":
      return { ...state, live: keepUnchanged(state.live, event.live) };
    default:
      return state;
  }
}

/**
 * 読み込んだ中身に、読み込みの最中に届いた知らせを順に当て直す（読み込みと知らせが行き違っても取りこぼさない。
 * サーバーが中身を作る前の知らせは、当て直しても同じになり、作ったあとの知らせは足される）。
 * prev は前に持っていた中身（取り直しのとき。変わっていない作業中の様子は前のものを使う）
 */
export function detailFromSnapshot(snapshot: ChatDetail, replay: readonly BusEvent[], chatId: number, prev: ChatDetailState = EMPTY_DETAIL): ChatDetailState {
  const base: ChatDetailState = {
    events: snapshot.events,
    range: rangeFromDetail(snapshot),
    live: keepUnchanged(prev.live, snapshot.live),
  };
  return replay.reduce((state, event) => reduceChatDetail(state, event, chatId), base);
}

/**
 * つなぎ直したときの取り直し（GET /api/chats/:id?after=<持っている最後の記録>）を、持っている記録の後ろに足す。
 * 記録のほか（チャット・作業中の様子）は読んだもので置き換え、読み込みの最中に届いた知らせは当て直す
 */
export function detailFromIncrement(snapshot: ChatDetail, replay: readonly BusEvent[], chatId: number, prev: ChatDetailState): ChatDetailState {
  const last = prev.events.at(-1)?.id ?? 0;
  const next = detailFromSnapshot({ ...snapshot, events: [...prev.events, ...snapshot.events.filter((e) => e.id > last)] }, replay, chatId, prev);
  // 末尾の前に読んだもの（索引など）はそのまま（after で読んだ詳細は索引を返さない）
  return { ...next, range: prev.range };
}

/** 詳細の応答のチャットに、読み込みの最中に届いたそのチャットの知らせを当て直したもの（行き違って古いチャットで上書きしない） */
export function chatAfter(chat: Chat, replay: readonly BusEvent[], chatId: number): Chat {
  return replay.reduce((current, event) => (event.type === "chat" && event.chat.id === chatId ? event.chat : current), chat);
}
