import type { TimelineItem } from "./timelineItems";

/** チャットの中の検索で見つけた 1 か所（どの発言の、その中の何番目か） */
export interface ChatFindMatch {
  eventId: number;
  /** その発言の中で何番目に出てくるか（0 から） */
  nth: number;
}

/**
 * チャットの記録から、自分の発言とメインの AI の返答の文で query を探す（大文字・小文字を区別しない。流れの順）。
 * 画面に描いた文ではなく記録から探すので、長いチャットでも流れをすべて描かずに数え、移れる
 */
export function findMatches(items: TimelineItem[], query: string): ChatFindMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: ChatFindMatch[] = [];
  for (const item of items) {
    if (item.kind !== "event" || (item.event.type !== "user" && item.event.type !== "text")) continue;
    const data = item.event.data as { text?: string; sub?: boolean };
    if (data.sub) continue;
    const text = String(data.text ?? "").toLowerCase();
    let nth = 0;
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) matches.push({ eventId: item.event.id, nth: nth++ });
  }
  return matches;
}
