import type { ChatEvent } from "@shared/chat/chatEvent";
import { CHAT_TAIL_MAX_BYTES, CHAT_TAIL_TURNS, CHAT_TURN_MAX_BYTES, CHAT_TURN_MAX_EVENTS, type ChatEventPage } from "@shared/chat/detail";
import type { IndexContext } from "@shared/chat/chatIndex";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import { indexCacheOf } from "./chatIndexCache";

/*
 * チャットの記録を末尾・ページ・索引で読む（読むだけ。ルートは薄く保つ）。
 * ターンの境目は作業の終わり（result）で、ターンの頭 = result の直後の記録（最初のターンは最初の記録）。自分の発言で数えない
 * （作業中に「いま」で伝えた発言はその作業の途中なので、そこで切ると作業の終わりに付けるもの（作業時間・返答のコピー・変更カード）と ToDo の作業の始まりが欠ける）。
 * 記録の ID はチャットをまたいで振るので、数えるのはいつもそのチャットの記録だけ（ID の差で数えない）
 */

const END = Number.MAX_SAFE_INTEGER;

/** 末尾・ページの読み方の上限 */
interface TurnLimits {
  turns: number;
  maxBytes: number;
}

/** 記録の並び（id ≥ from）の大きさを、ターンの頭ごとに数える道具（覆う索引だけを読む） */
function sizesFrom(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, from: number, to: number) {
  const rows = store.events.metas(chatId, from, to);
  return {
    rows,
    /** id ≥ start の記録の数と大きさ */
    after(start: number) {
      let count = 0;
      let bytes = 0;
      for (const r of rows) {
        if (r.meta.id < start) continue;
        count++;
        bytes += r.size;
      }
      return { count, bytes };
    },
  };
}

/**
 * 1 ターンが大きすぎる（CHAT_TURN_MAX_EVENTS 件か CHAT_TURN_MAX_BYTES を超える）ときに、終わりから上限までの頭（id）。収まれば start のまま
 */
function capFromEnd(rows: readonly { meta: { id: number }; size: number }[], start: number): { start: number; partial: boolean } {
  let count = 0;
  let bytes = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.meta.id < start) break;
    // 最後の 1 件は大きくても残す（空の末尾にしない）
    if (count > 0 && (count + 1 > CHAT_TURN_MAX_EVENTS || bytes + r.size > CHAT_TURN_MAX_BYTES)) return { start: rows[i + 1].meta.id, partial: true };
    count++;
    bytes += r.size;
  }
  return { start, partial: false };
}

/**
 * before の手前を turns ターン読むときの頭（id）。result を新しい順に turns + 1 件取り、turns + 1 件目の直後から（足りなければ最初から = 0）。
 * 大きさが maxBytes を超えるなら 1 ターンずつ新しい方へずらし（最新の 1 ターンは残す）、それでも 1 ターンが大きすぎれば終わりから上限まで（partial）
 */
function turnHead(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, before: number, { turns, maxBytes }: TurnLimits): { start: number; partial: boolean } {
  const results = store.events.resultIdsBefore(chatId, before, turns + 1);
  // 境目の候補（新しい順）: results[k] の直後から読むと、k 件の作業の終わり（と、その後ろの作業中の分）が入る
  const heads = results.map((id) => id + 1);
  let k = results.length > turns ? turns : results.length;
  const startOf = (n: number) => (n >= results.length ? 0 : heads[n]);
  const sizes = sizesFrom(store, chatId, startOf(k), before);
  // 最新の 1 ターンは残す（before の直前が作業の終わりなら、その作業）
  const minK = Math.min(results.length, results[0] !== undefined && !store.events.hasBetween(chatId, results[0] + 1, before) ? 1 : 0);
  while (k > minK && sizes.after(startOf(k)).bytes > maxBytes) k--;
  return capFromEnd(sizes.rows, startOf(k));
}

/** id を含むターンの頭（その記録の前の作業の終わりの直後。なければ最初 = 0） */
function headOf(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, id: number): number {
  const prev = store.events.resultIdsBefore(chatId, id, 1)[0];
  return prev === undefined ? 0 : prev + 1;
}

/**
 * 末尾の始まり（ターンの頭）。最新 turns ターン（大きさの上限で減らす）を読み、最新のメインエージェントの返答・未読の記録が前にあれば、そのターンの頭まで広げる
 * （未読の判定・子チャットの帯の引用が末尾だけで済むように）。広げたあとも 1 ターンが大きすぎれば終わりから上限まで（headPartial）
 */
export function tailStart(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, limits: TurnLimits = { turns: CHAT_TAIL_TURNS, maxBytes: CHAT_TAIL_MAX_BYTES }): { start: number; headPartial: boolean } {
  const head = turnHead(store, chatId, END, limits);
  let start = head.start;
  if (head.partial) return { start, headPartial: true };
  for (const must of [store.events.latestMainTextId(chatId), store.events.latestUnreadId(chatId) || null]) {
    if (must !== null && must < start) start = headOf(store, chatId, must);
  }
  if (start === head.start) return { start, headPartial: false };
  const capped = capFromEnd(sizesFrom(store, chatId, start, END).rows, start);
  return { start: capped.start, headPartial: capped.partial };
}

/**
 * 末尾より前の記録の索引（覆う索引だけから軽い形を読んで JS の selectIndexIds で選び、選んだ行だけを読んで軽くする）。
 * 読んだ軽い形と選んだ行はチャットごとに覚え、次からは増えた分だけを読む（chatIndexCache.ts）
 */
export function buildIndex(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, start: number, ctx: IndexContext): ChatEvent[] {
  return indexCacheOf(store).index(chatId, start, ctx);
}

/** before の手前を turns ターン（tailStart と同じ決まり） */
export function pageBefore(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, before: number, turns: number): ChatEventPage {
  const { start, partial } = turnHead(store, chatId, before, { turns, maxBytes: CHAT_TAIL_MAX_BYTES });
  const events = store.events.range(chatId, start, before);
  return { events, has_earlier: events.length > 0 ? store.events.hasBefore(chatId, events[0].id) : store.events.hasBefore(chatId, before), has_later: false, head_partial: partial };
}

/** since 以上 before 未満をすべて（頭のターンを埋める・遠くない記録まで末尾を伸ばす） */
export function pageSince(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, before: number, since: number): ChatEventPage {
  const events = store.events.range(chatId, since, before);
  const first = events[0]?.id ?? since;
  return { events, has_earlier: store.events.hasBefore(chatId, first), has_later: false, head_partial: false };
}

/** 終わり（end を含む）から後ろ、until の手前までにまだ記録があるか */
const laterThan = (store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, last: number, until: number) => store.events.hasBetween(chatId, last + 1, until);

/** around を含むターンから前へ 3 ターン、合わせて turns ターン（遠い所へ移るときの途中の一部分。until の手前まで） */
export function pageAround(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, around: number, turns: number, until = END): ChatEventPage {
  const before = Math.min(3, turns - 1);
  const prev = store.events.resultIdsBefore(chatId, around, before + 1);
  const start = prev.length > before ? prev[before] + 1 : 0;
  const ends = store.events.resultIdsFrom(chatId, around, until, turns - before);
  const end = ends.length === turns - before ? ends[ends.length - 1] + 1 : until;
  const events = store.events.range(chatId, start, end);
  const last = events.at(-1)?.id ?? around;
  return {
    events,
    has_earlier: store.events.hasBefore(chatId, events[0]?.id ?? start),
    has_later: laterThan(store, chatId, last, until),
    head_partial: false,
  };
}

/** after より後ろを turns ターン（until の手前まで。途中の一部分を下へ伸ばす） */
export function pageAfter(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, after: number, turns: number, until = END): ChatEventPage {
  const ends = store.events.resultIdsFrom(chatId, after + 1, until, turns);
  const end = ends.length === turns ? ends[ends.length - 1] + 1 : until;
  const events = store.events.range(chatId, after + 1, end);
  const last = events.at(-1)?.id ?? after;
  return { events, has_earlier: true, has_later: laterThan(store, chatId, last, until), head_partial: false };
}

/** サブエージェントの中（parent が parents のもの・ids の記録。before 未満）。覆う索引で選び、選んだ行だけを読む */
export function scopeEvents(store: Pick<ChatStoreDeps, "chats" | "events" | "agentSessions" | "logRevisions" | "db" | "projects" | "groups" | "trash">, chatId: number, parents: readonly string[], ids: readonly number[], before: number): ChatEvent[] {
  const inScope = new Set(parents);
  const wanted = new Set(ids);
  const picked = store.events
    .metas(chatId, 0, before)
    .filter((r) => wanted.has(r.meta.id) || (r.meta.parent !== null && inScope.has(r.meta.parent)))
    .map((r) => r.meta.id);
  return store.events.byIds(chatId, picked);
}
