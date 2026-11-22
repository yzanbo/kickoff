import type { TimelineItem } from "./timelineItems";
import { rowKindOf } from "./rowKinds";

/** 記録の ID を含む項目の位置（発言そのもの・ツールの呼び出しと結果。なければ -1。移る処理が流れの窓の行の番号にする） */
export function itemIndexOfEvent(items: TimelineItem[], eventId: number): number {
  return items.findIndex((item) => rowKindOf(item).contains(item, eventId));
}
