import type { TimelineItem } from "./timelineItems";

/** チャットの中の検索で見つけた 1 か所（どの発言の、その中の何番目か） */
export interface ChatFindMatch {
  eventId: number;
  /** その発言の中で何番目に出てくるか（0 から） */
  nth: number;
}

/**
 * 文 text の中で query が出てくる位置（重ならないように前から）。query は打ったまま使い、前後の空白も削らない
 * （半角・全角の空白も探す文字のうち。VS Code の検索と同じ）。caseSensitive でなければ大文字・小文字を区別しない
 */
export function matchOffsets(text: string, query: string, caseSensitive: boolean): number[] {
  if (!query) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const offsets: number[] = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) offsets.push(at);
  return offsets;
}

/**
 * チャットの記録から、自分の発言とメインの AI の返答の文で query を探す（流れの順）。
 * 画面に描いた文ではなく記録から探すので、長いチャットでも流れをすべて描かずに数え、移れる
 */
export function findMatches(items: TimelineItem[], query: string, caseSensitive = false): ChatFindMatch[] {
  if (!query) return [];
  const matches: ChatFindMatch[] = [];
  for (const item of items) {
    if (item.kind !== "event" || (item.event.type !== "user" && item.event.type !== "text")) continue;
    const data = item.event.data as { text?: string; sub?: boolean };
    if (data.sub) continue;
    matchOffsets(String(data.text ?? ""), query, caseSensitive).forEach((_, nth) => matches.push({ eventId: item.event.id, nth }));
  }
  return matches;
}
