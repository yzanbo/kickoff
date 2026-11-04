import type { TimelineItem } from "./timelineItems";

/**
 * 流れの窓: 長いチャットでも、描くのは最近の項目だけにする（数千件を一度に描くと、画面の要素が 10 万個近くになり、
 * 返答が届くたびの描き直し・入力欄の高さが変わるときの並べ直しが重くなる）。上の端まで戻ると、この数ずつ前を足す
 */
export const TIMELINE_WINDOW = 120;

/** 移り先の前に、文脈として一緒に描く項目の数 */
const CONTEXT_BEFORE = 10;

/** 記録の ID を含む項目の位置（発言そのもの・ツールの呼び出しと結果。なければ -1） */
export function itemIndexOfEvent(items: TimelineItem[], eventId: number): number {
  return items.findIndex((item) =>
    item.kind === "event" ? item.event.id === eventId : item.tools.some((t) => t.use.id === eventId || t.result?.id === eventId),
  );
}

/** 窓の始まり（描く最初の項目の位置）。shown 件を描き、mustInclude（移り先）があれば、その少し前から描く */
export function windowStart(total: number, shown: number, mustInclude?: number): number {
  const start = Math.max(0, total - shown);
  if (mustInclude === undefined || mustInclude < 0 || mustInclude >= start) return start;
  return Math.max(0, mustInclude - CONTEXT_BEFORE);
}

/** 移り先から最新までがこれより多ければ、そこから最新までは描かず、移り先の前後だけを描く（窓を途中の一部分にする） */
export const MAX_TAIL = 400;

/** 描く範囲（start から end の手前まで。end が null なら最新まで） */
export interface WindowRange {
  start: number;
  end: number | null;
}

/**
 * 移り先（index）を描く範囲。少し前から描き、最新まで近ければ最新まで、遠ければ移り先のあと TIMELINE_WINDOW 件まで
 * （検索で古い発言へ移っても、そこから最新までをすべて描かない。数万件のチャットで画面が落ちないように）
 */
export function revealRange(total: number, index: number): WindowRange {
  const start = Math.max(0, index - CONTEXT_BEFORE);
  // 最新まで描くときは、ふだんの窓（最新から TIMELINE_WINDOW 件）より短くしない（移り先を画面の真ん中に置けるように）
  if (total - start <= MAX_TAIL) return { start: Math.max(0, Math.min(start, total - TIMELINE_WINDOW)), end: null };
  return { start, end: Math.min(total, index + TIMELINE_WINDOW) };
}
