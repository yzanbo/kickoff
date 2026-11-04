// 送信待ちの「ここまで送ったら止めます」の印の位置（指示とは別に、列の中の位置で持つ。0 = 1 件目の上、n = n 件目のあと）
import type { QueuedMessage } from "@shared/types";

/** 印の位置を整える（整数で 0〜列の長さに収め、重なりを除いて小さい順に） */
export function normalizeStops(stops: number[], length: number): number[] {
  const inRange = stops.filter((k) => Number.isInteger(k)).map((k) => Math.max(0, Math.min(length, k)));
  return [...new Set(inRange)].sort((a, b) => a - b);
}

/**
 * 列が変わったときの印の位置。印より前にあった指示のうち、変わったあとも残っているものの数にする
 * （並べ替えでは動かない。前の指示を送った・消した・まとめたら、その分だけ上に寄る）
 */
export function remapStops(prev: QueuedMessage[], next: QueuedMessage[], stops: number[]): number[] {
  if (stops.length === 0) return stops;
  const kept = new Set(next.map((m) => m.id));
  return normalizeStops(
    stops.map((k) => prev.slice(0, k).filter((m) => kept.has(m.id)).length),
    next.length,
  );
}

/**
 * 保存した印を読む（stop_after の列）。いまの形は位置の JSON の配列。印を指示に付けていたころの形
 * （指示の ID そのまま・ID の JSON の配列）は、その指示のすぐあとの位置にする
 */
export function decodeStops(raw: string | null, messages: QueuedMessage[]): number[] {
  if (!raw) return [];
  let items: unknown[] = [raw];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }
  }
  const stops = items.flatMap((x) => {
    if (typeof x === "number") return [x];
    const index = typeof x === "string" ? messages.findIndex((m) => m.id === x) : -1;
    return index >= 0 ? [index + 1] : [];
  });
  return normalizeStops(stops, messages.length);
}

/** 印を保存する形（位置の JSON の配列。なければ null） */
export const encodeStops = (stops: number[]): string | null => (stops.length === 0 ? null : JSON.stringify(stops));

/**
 * 指示を動かす先（印の線も並んだ見た目の並びの中の、すき間）。at は動かす前の並びでの位置（0〜件数。その位置の指示の前）、
 * belowStop はその位置に印があるとき、印の下（true）に入れるか上（false）に入れるか
 */
export interface QueueSlot {
  at: number;
  belowStop: boolean;
}

/**
 * 指示を、並びを保ったまま slot へ動かしたあとの列と印の位置。
 * 印の線は見た目の並びの 1 行として扱い、動かした指示だけが線の上下を移る（動かしていない指示は線の同じ側に残る）。
 * 以前は印を位置の数のまま残していたので、いちばん上・下へ移すと、動かしていない指示が線を越えて止まる所がずれていた
 */
export function moveToSlot<T extends { id: string }>(list: T[], stops: number[], ids: string[], slot: QueueSlot): { list: T[]; stops: number[] } {
  const moving = new Set(ids);
  const picked = list.filter((m) => moving.has(m.id));
  if (picked.length === 0) return { list, stops };
  const at = Math.max(0, Math.min(list.length, slot.at));
  const marks = normalizeStops(stops, list.length);
  // 見た目の並び（印 → その位置の指示 → … → いちばん下の印）
  type Token = { item: T } | { stop: true };
  const tokens: Token[] = [];
  for (let i = 0; i <= list.length; i++) {
    if (marks.includes(i)) tokens.push({ stop: true });
    if (i < list.length) tokens.push({ item: list[i] });
  }
  // すき間の位置（その前にある行の数）から、動かす指示を抜いた分を引く
  const slotIndex = at + marks.filter((k) => k < at || (k === at && slot.belowStop)).length;
  const movedBefore = list.slice(0, at).filter((m) => moving.has(m.id)).length;
  const rest = tokens.filter((t) => !("item" in t && moving.has(t.item.id)));
  rest.splice(slotIndex - movedBefore, 0, ...picked.map((item) => ({ item })));
  const next: T[] = [];
  const nextStops: number[] = [];
  for (const t of rest) {
    if ("item" in t) next.push(t.item);
    else nextStops.push(next.length);
  }
  return { list: next, stops: normalizeStops(nextStops, next.length) };
}
