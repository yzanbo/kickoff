// 1 つのチャットの中身（チャット・記録・回答待ち・作業中の様子）を、サーバーの知らせで直す決まり（純粋関数。useChatDetail が使う）
import type { Approval, BusEvent, Chat, ChatDetail, ChatEvent, ChatLive } from "@shared/types";

/** 画面が持つチャットの中身（読み込む前は chat が undefined） */
export interface ChatDetailState {
  chat: Chat | undefined;
  events: ChatEvent[];
  approvals: Approval[];
  live: ChatLive;
}

/** 読み込む前・何も起きていないときの作業中の様子 */
const IDLE_LIVE: ChatLive = {
  queue: { messages: [], paused: false, stops: [], waiting_edit: false },
  background: null,
  retry: null,
  reconnect: null,
  compacting: null,
  stopping: false,
  compact_next: false,
};

/** 読み込む前の中身 */
export const EMPTY_DETAIL: ChatDetailState = { chat: undefined, events: [], approvals: [], live: IDLE_LIVE };

/**
 * 届いた作業中の様子のうち、中身の変わっていないものは前のものを使う（chat_live はどれかが変わるたびに丸ごと届くので、
 * 裏の作業などを見て記録をたどる計算（useSubagents など）を、変わっていないのにやり直さないため）
 */
export function keepUnchanged(prev: ChatLive, next: ChatLive): ChatLive {
  const keep = <T,>(a: T, b: T): T => (JSON.stringify(a) === JSON.stringify(b) ? a : b);
  return {
    queue: keep(prev.queue, next.queue),
    background: keep(prev.background, next.background),
    retry: keep(prev.retry, next.retry),
    reconnect: keep(prev.reconnect, next.reconnect),
    compacting: next.compacting,
    stopping: next.stopping,
    compact_next: next.compact_next,
  };
}

/** このチャットの中身を変える知らせか（書いている途中の返答 chat_delta は別に扱うので含めない） */
export function concernsDetail(event: BusEvent, chatId: number): boolean {
  switch (event.type) {
    case "chat":
      return event.chat.id === chatId;
    case "chat_event":
      return event.event.chat_id === chatId;
    case "approval":
      return event.approval.chat_id === chatId;
    case "chat_events_deleted":
    case "chat_live":
    case "approval_resolved":
      return event.chat_id === chatId;
    default:
      return false;
  }
}

/**
 * 知らせで中身を直す（このチャットのものでなければ、そのまま返す）。同じ知らせを 2 回当てても同じになる
 * （記録・回答待ちは ID で重ねない）ので、読み込みの最中に届いた知らせを、届いた中身にもう一度当てられる
 */
export function reduceChatDetail(state: ChatDetailState, event: BusEvent, chatId: number): ChatDetailState {
  if (!concernsDetail(event, chatId)) return state;
  switch (event.type) {
    case "chat":
      return { ...state, chat: event.chat };
    case "chat_event": {
      // 記録は ID の順に届く。いちばん新しいものより前の ID なら、もう持っているかを確かめる
      const last = state.events.at(-1);
      if (last && event.event.id <= last.id && state.events.some((x) => x.id === event.event.id)) return state;
      return { ...state, events: [...state.events, event.event] };
    }
    case "chat_events_deleted": {
      // 巻き戻した: その発言から後ろを画面の記録からも消す
      const events = state.events.filter((x) => x.id < event.from_event_id);
      return events.length === state.events.length ? state : { ...state, events };
    }
    case "chat_live":
      return { ...state, live: keepUnchanged(state.live, event.live) };
    case "approval":
      return state.approvals.some((a) => a.id === event.approval.id) ? state : { ...state, approvals: [...state.approvals, event.approval] };
    case "approval_resolved": {
      const approvals = state.approvals.filter((a) => a.id !== event.id);
      return approvals.length === state.approvals.length ? state : { ...state, approvals };
    }
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
    chat: snapshot.chat,
    events: snapshot.events,
    approvals: snapshot.approvals,
    live: keepUnchanged(prev.live, snapshot.live),
  };
  return replay.reduce((state, event) => reduceChatDetail(state, event, chatId), base);
}
