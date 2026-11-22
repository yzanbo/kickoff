// サブエージェントの流れの項目（カードの中・右の欄の画面。記録が届くたびに描き直すので、流れごとに前の項目を覚えて中身が同じ項目は前の物にする）
import type { ChatEvent } from "@shared/chat/chatEvent";
import { createLruMap } from "@/foundation/ui/lib/lruMap";
import { groupEvents, type TimelineItem } from "./timelineItems";

/** 流れ（scope をつないだもの）ごとの前の答え */
const last = createLruMap<string, { events: readonly ChatEvent[]; items: TimelineItem[] }>(500);

/** そのサブエージェントの流れの項目（記録が前と同じ配列なら前の答え） */
export function scopeItems(events: readonly ChatEvent[], scope: readonly string[]): TimelineItem[] {
  const key = scope.join(" ");
  const prev = last.get(key);
  if (prev?.events === events) return prev.items;
  const items = groupEvents(events, scope, { prev: prev?.items });
  last.set(key, { events, items });
  return items;
}
