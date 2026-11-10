import { spansIn, type FindPattern } from "@/lib/textFind";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";

/** チャットの中の検索で見つけた 1 か所（どの発言の、その中の何番目か） */
export interface ChatFindMatch {
  eventId: number;
  /** その発言の中で何番目に出てくるか（0 から） */
  nth: number;
}

/**
 * チャットの記録から、自分の発言とメインの AI の返答の文で pattern を探す（流れの順。探し方は lib/textFind の findPattern で作る。画面の印と同じ照らし合わせ）。
 * 画面に描いた文ではなく記録から探すので、長いチャットでも流れをすべて描かずに数え、移れる
 */
export function findMatches(items: TimelineItem[], pattern: FindPattern): ChatFindMatch[] {
  if (!pattern || "error" in pattern) return [];
  const matches: ChatFindMatch[] = [];
  for (const item of items) {
    if (item.kind !== "event") continue;
    const e = item.event;
    // 自分の発言とメインの AI の返答だけ（サブエージェントの返答は除く）
    if (e.type !== "user" && !(e.type === "text" && !e.data.parent)) continue;
    spansIn(e.data.text, pattern).forEach((_, nth) => matches.push({ eventId: item.event.id, nth }));
  }
  return matches;
}
