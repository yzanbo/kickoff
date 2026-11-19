// チャットの記録の読み込んだ範囲（末尾・索引・途中の一部分・サブエージェントの中）の決まり（純粋関数。チャットの店 chatStore.ts が使う）。
// 末尾 = 開いたときに読む最新のターンから終わりまで（つながっている。SSE の記録はここに足す）、
// 索引 = 末尾より前の、記録全体から作るもの（サブエージェントの一覧・ToDo・図・指示の履歴など）が要る記録だけを軽くしたもの、
// 途中の一部分 = 遠い発言へ移ったときに読む、末尾とつながっていないまとまり。記録全体から作る関数には、これらを重ねたもの（digest）を渡す
import type { ChatDetail, ChatEvent, ChatEventPage } from "@shared/types";
import { indexOfEvents, mergeById, type IndexContext } from "@shared/chat/chatIndex";
import { CHAT_TAIL_TURNS } from "@shared/types";

/** 途中の一部分（いつも末尾より前。下の端が末尾に届いたら末尾につなぐ） */
interface LogFocus {
  events: ChatEvent[];
  hasEarlier: boolean;
}

/** 末尾のほかに読んだもの */
export interface LogRange {
  /** 末尾の始まりの記録の ID（0 = 最初から読んでいる） */
  tailStart: number;
  /** 末尾より前の索引（軽くした記録） */
  index: ChatEvent[];
  /** 末尾より前に記録があるか */
  hasEarlier: boolean;
  /** 末尾の頭のターンが大きすぎて途中から読んでいるか（作業の終わりの行に、そのターン全体から作るものを出さない） */
  headPartial: boolean;
  focus: LogFocus | null;
  /** 末尾より前に始まったサブエージェントの中の記録（カード・右の欄を開いたときに読む） */
  scopes: ChatEvent[];
  /** 中を読んだサブエージェントの流れ（parent） */
  scopeKeys: readonly string[];
}

export const EMPTY_RANGE: LogRange = { tailStart: 0, index: [], hasEarlier: false, headPartial: false, focus: null, scopes: [], scopeKeys: [] };

/** チャットの詳細から（末尾で読んでいなければ = 索引がなければ、記録はすべてで、その前はない） */
export function rangeFromDetail(d: ChatDetail): LogRange {
  if (d.index === undefined) return EMPTY_RANGE;
  const tailStart = d.events[0]?.id ?? (d.index.at(-1)?.id ?? -1) + 1;
  return { ...EMPTY_RANGE, tailStart, index: d.index, hasEarlier: d.has_earlier ?? false, headPartial: d.head_partial ?? false };
}

const below = (events: ChatEvent[], id: number): ChatEvent[] => (events.length === 0 || events.at(-1)!.id < id ? events : events.filter((e) => e.id < id));

/** 末尾の前に page を足す（さかのぼった）。索引・サブエージェントの中は、新しい始まりより前だけにする */
export function prependTail(range: LogRange, tail: readonly ChatEvent[], page: ChatEventPage): { range: LogRange; tail: ChatEvent[] } {
  const events = page.events.filter((e) => e.id < range.tailStart || range.tailStart === 0);
  if (events.length === 0) return { range: { ...range, hasEarlier: page.has_earlier, headPartial: range.headPartial && page.head_partial }, tail: [...tail] };
  const tailStart = events[0].id;
  return {
    range: {
      ...range,
      tailStart,
      index: below(range.index, tailStart),
      scopes: below(range.scopes, tailStart),
      hasEarlier: page.has_earlier,
      headPartial: page.head_partial,
      focus: range.focus && (range.focus.events[0]?.id ?? 0) < tailStart ? range.focus : null,
    },
    tail: [...events, ...tail],
  };
}

/** 途中の一部分を置く（下の端が末尾まで届いていれば、そのまま末尾につなぐ） */
export function withFocus(range: LogRange, tail: readonly ChatEvent[], page: ChatEventPage): { range: LogRange; tail: ChatEvent[] } {
  if (!page.has_later) return joinTail(range, tail, page.events, page.has_earlier);
  return { range: { ...range, focus: { events: page.events, hasEarlier: page.has_earlier } }, tail: [...tail] };
}

/** 途中の一部分を上へ伸ばす（その前を読んだ） */
export function focusEarlier(range: LogRange, page: ChatEventPage): LogRange {
  const focus = range.focus;
  if (!focus) return range;
  const first = focus.events[0]?.id ?? Number.MAX_SAFE_INTEGER;
  return { ...range, focus: { events: [...page.events.filter((e) => e.id < first), ...focus.events], hasEarlier: page.has_earlier } };
}

/** 途中の一部分を下へ伸ばす（末尾に届いたら末尾につなぐ） */
export function focusLater(range: LogRange, tail: readonly ChatEvent[], page: ChatEventPage): { range: LogRange; tail: ChatEvent[] } {
  const focus = range.focus;
  if (!focus) return { range, tail: [...tail] };
  const last = focus.events.at(-1)?.id ?? 0;
  const events = [...focus.events, ...page.events.filter((e) => e.id > last)];
  if (!page.has_later) return joinTail(range, tail, events, focus.hasEarlier);
  return { range: { ...range, focus: { events, hasEarlier: focus.hasEarlier } }, tail: [...tail] };
}

/** 末尾の前につながっている記録を末尾にする（途中の一部分が末尾に届いた・近い所までさかのぼった） */
function joinTail(range: LogRange, tail: readonly ChatEvent[], events: readonly ChatEvent[], hasEarlier: boolean): { range: LogRange; tail: ChatEvent[] } {
  const head = events.filter((e) => range.tailStart === 0 || e.id < range.tailStart);
  if (head.length === 0) return { range: { ...range, focus: null }, tail: [...tail] };
  const tailStart = head[0].id;
  return {
    range: { ...range, focus: null, tailStart, index: below(range.index, tailStart), scopes: below(range.scopes, tailStart), hasEarlier, headPartial: false },
    tail: [...head, ...tail],
  };
}

/** 末尾の前の since 以上の記録を足す（近い所までさかのぼった。pageSince の答え） */
export function joinSince(range: LogRange, tail: readonly ChatEvent[], page: ChatEventPage): { range: LogRange; tail: ChatEvent[] } {
  return joinTail(range, tail, page.events, page.has_earlier);
}

/** サブエージェントの中を足す */
export function withScopes(range: LogRange, parents: readonly string[], events: readonly ChatEvent[]): LogRange {
  const scopes = below(mergeById(range.scopes, events), range.tailStart);
  return { ...range, scopes, scopeKeys: [...new Set([...range.scopeKeys, ...parents])] };
}

/** 巻き戻しで from から後ろを消した（末尾の前で消したなら、呼ぶ側が読み直す） */
export function deleteFrom(range: LogRange, from: number): LogRange {
  const focus = range.focus && { ...range.focus, events: below(range.focus.events, from) };
  return { ...range, index: below(range.index, from), scopes: below(range.scopes, from), focus: focus && focus.events.length > 0 ? focus : null };
}

/** その記録を含むターンの頭（索引の作業の終わりから。索引には作業の終わりがすべて入る） */
export function turnHeadOf(range: LogRange, id: number): number {
  let head = 0;
  for (const e of range.index) {
    if (e.id >= id) break;
    if (e.type === "result") head = e.id + 1;
  }
  return head;
}

/** その記録から末尾の始まりまでのターンの数（索引の作業の終わりを数える） */
export function turnsBefore(range: LogRange, id: number): number {
  return range.index.filter((e) => e.type === "result" && e.id >= id).length;
}

/**
 * 見ていない間の末尾を縮める（最新 turns ターンだけを残し、その前は索引に移す）。途中の一部分・サブエージェントの中は捨てる。
 * 索引は残す末尾の前の分を indexOfEvents で作り、もとの索引に重ねる
 */
export function shrinkTail(range: LogRange, tail: readonly ChatEvent[], ctx: IndexContext, turns = CHAT_TAIL_TURNS): { range: LogRange; tail: ChatEvent[] } {
  let seen = 0;
  let cut = -1;
  for (let i = tail.length - 1; i >= 0; i--) {
    if (tail[i].type !== "result") continue;
    // 作業の終わりを数える（最後が作業中なら、その分はターンに数えずに残す）
    seen++;
    if (seen > turns) {
      cut = i + 1;
      break;
    }
  }
  if (cut <= 0) return { range: { ...range, focus: null, scopes: [], scopeKeys: [] }, tail: [...tail] };
  const tailStart = tail[cut].id;
  const index = mergeById(range.index, indexOfEvents(tail as ChatEvent[], tailStart, ctx));
  return { range: { ...range, tailStart, index, hasEarlier: true, headPartial: false, focus: null, scopes: [], scopeKeys: [] }, tail: tail.slice(cut) };
}

/** 記録全体から作る関数に渡すもの（末尾・途中の一部分・サブエージェントの中・索引を ID の順に重ねる。同じ ID は中身のままのものを使う） */
export function digestOf(range: LogRange, tail: ChatEvent[]): ChatEvent[] {
  const focus = range.focus?.events ?? [];
  if (focus.length === 0 && range.scopes.length === 0) return range.index.length === 0 ? tail : [...range.index, ...tail];
  return mergeById(tail, focus, range.scopes, range.index);
}

/** 中身のまま読んだ記録（末尾・途中の一部分・サブエージェントの中。サブエージェントのカード・動きが使う） */
export function loadedOf(range: LogRange, tail: ChatEvent[]): ChatEvent[] {
  const focus = range.focus?.events ?? [];
  if (focus.length === 0 && range.scopes.length === 0) return tail;
  return mergeById(tail, focus, range.scopes);
}

/** 流れに出す記録の前にある、記録全体から作るものに要る記録（流れの項目を作るとき、前に起動したサブエージェントを数える） */
export function prefaceOf(range: LogRange, tail: ChatEvent[]): ChatEvent[] {
  const focus = range.focus?.events;
  if (!focus) return range.scopes.length === 0 ? range.index : mergeById(range.scopes, range.index);
  const first = focus[0]?.id ?? 0;
  return digestOf(range, tail).filter((e) => e.id < first);
}

/** その記録を流れに出せるか（途中の一部分があればその中、なければ末尾の中） */
export function displays(range: LogRange, tail: readonly ChatEvent[], id: number): boolean {
  const shown = range.focus?.events ?? tail;
  if (shown.length === 0) return false;
  return range.focus ? id >= shown[0].id && id <= shown.at(-1)!.id : id >= range.tailStart;
}
