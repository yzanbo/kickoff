import { spansIn, type FindPattern } from "@/lib/textFind";
import type { ChatEvent } from "@shared/types";

/** チャットの中の検索で見つけた 1 か所（どの発言の、その中の何番目か） */
export interface ChatFindMatch {
  eventId: number;
  /** その発言の中で何番目に出てくるか（0 から） */
  nth: number;
}

/**
 * チャットの記録から、自分の発言とメインの AI の返答の文で pattern を探す（記録の順。探し方は lib/textFind の findPattern で作る。画面の印と同じ照らし合わせ）。
 * 画面に描いた文ではなく記録から探すので、長いチャットでも流れをすべて描かずに数え、移れる。末尾より前の本文はコアの /texts で読んだもの
 * （正規表現をコアで流さないため。メモの仕様書「0023_表示を軽くする」の案 4）
 */
export function findMatches(events: readonly ChatEvent[], pattern: FindPattern): ChatFindMatch[] {
  if (!pattern || "error" in pattern) return [];
  const matches: ChatFindMatch[] = [];
  for (const e of events) {
    // 自分の発言とメインの AI の返答だけ（サブエージェントの返答は除く）
    if (e.type !== "user" && !(e.type === "text" && !e.data.parent)) continue;
    spansIn(e.data.text, pattern).forEach((_, nth) => matches.push({ eventId: e.id, nth }));
  }
  return matches;
}
