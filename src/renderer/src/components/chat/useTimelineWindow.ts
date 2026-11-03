import { useEffect, useMemo, useState, type RefObject } from "react";
import { itemIndexOfEvent, TIMELINE_WINDOW, windowStart } from "./timelineWindow";
import type { TimelineItem } from "./timelineItems";

/**
 * チャットの流れの窓（最近の項目だけを描く。timelineWindow.ts）。
 * - 上の端まで戻ったら showMore で前を足す
 * - 一番下へ戻った・一番下を見ている間に新しい項目が届いたら、窓を元の大きさに戻す（長く開いていても描く量が増えていかない）
 * - 検索結果から開いた発言（focus）・移り先（reveal）が窓の外なら、窓を広げる
 * - all（チャットの中の検索中。画面の文を探すため）はすべて描く
 */
export function useTimelineWindow({
  items,
  runId,
  focus,
  all,
  stickToBottom,
}: {
  items: TimelineItem[];
  runId: number;
  focus?: number;
  all: boolean;
  stickToBottom: RefObject<boolean>;
}) {
  const [shown, setShown] = useState(TIMELINE_WINDOW);
  useEffect(() => setShown(TIMELINE_WINDOW), [runId]);
  useEffect(() => {
    if (stickToBottom.current) setShown((s) => Math.min(s, TIMELINE_WINDOW));
  }, [items.length, stickToBottom]);

  const focusIndex = focus ? itemIndexOfEvent(items, focus) : -1;
  const start = all ? 0 : windowStart(items.length, shown, focusIndex);
  const visible = useMemo(() => (start > 0 ? items.slice(start) : items), [items, start]);

  return {
    visible,
    /** 窓の外（上）にある項目の数 */
    hidden: start,
    showMore: () => setShown((s) => Math.max(s, items.length - start) + TIMELINE_WINDOW),
    /** 一番下へ戻った: 窓を元の大きさに戻す（上の項目を外しても、一番下のまま） */
    atBottom: () => setShown((s) => Math.min(s, TIMELINE_WINDOW)),
    /** 記録の ID の発言を描くようにする。すでに描いていれば true（すぐ移れる）、窓を広げたら false（描いたあとに移る） */
    reveal: (eventId: number): boolean => {
      const index = itemIndexOfEvent(items, eventId);
      if (index < 0 || index >= start) return true;
      setShown(items.length - windowStart(items.length, 0, index));
      return false;
    },
  };
}
