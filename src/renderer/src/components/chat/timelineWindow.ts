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
