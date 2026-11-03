// 送信待ちの「ここまで送ったら止めます」の印の位置（指示とは別に、列の中の位置で持つ。0 = 1 件目の上、n = n 件目のあと）
import type { QueuedMessage } from "./types.js";

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
