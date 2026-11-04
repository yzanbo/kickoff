import { useEffect, useMemo, useState, type RefObject } from "react";
import { itemIndexOfEvent, revealRange, TIMELINE_WINDOW, windowStart, type WindowRange } from "./timelineWindow";
import type { TimelineItem } from "./timelineItems";

/**
 * チャットの流れの窓（最近の項目だけを描く。timelineWindow.ts）。
 * - ふだんは最新から shown 件。上の端まで戻ったら showMore で前を足す
 * - 一番下へ戻った・一番下を見ている間に新しい項目が届いたら、窓を元の大きさに戻す（長く開いていても描く量が増えていかない）
 * - 検索結果から開いた発言（focus）・移り先（reveal）が窓の外なら、その前後を描く範囲（range）にする。
 *   最新から遠ければ途中の一部分だけを描き（下の端まで来たら showLater で後ろを足す）、最新へは latest で戻る。
 *   チャットの中の検索も記録から探して移り先だけを描く（すべて描くと、数千ターンのチャットで画面が落ちる）
 */
export function useTimelineWindow({
  items,
  chatId,
  focus,
  stickToBottom,
}: {
  items: TimelineItem[];
  chatId: number;
  focus?: number;
  stickToBottom: RefObject<boolean>;
}) {
  const [shown, setShown] = useState(TIMELINE_WINDOW);
  // 移り先の前後を描いているとき（null = 最新から shown 件）
  const [range, setRange] = useState<WindowRange | null>(null);
  useEffect(() => {
    setShown(TIMELINE_WINDOW);
    setRange(null);
  }, [chatId]);
  useEffect(() => {
    if (stickToBottom.current) setShown((s) => Math.min(s, TIMELINE_WINDOW));
  }, [items.length, stickToBottom]);

  const total = items.length;
  const start = range ? Math.min(range.start, total) : windowStart(total, shown);
  const end = range?.end == null ? total : Math.min(range.end, total);

  // 検索結果から開いた発言が窓の外なら、その前後を描く（描く前に決め、1 回目の描画から含める。開くたびに 1 回だけ）
  const [focused, setFocused] = useState<number>();
  const focusIndex = focus ? itemIndexOfEvent(items, focus) : -1;
  if (focus && focusIndex >= 0 && focused !== focus) {
    setFocused(focus);
    if (focusIndex < start || focusIndex >= end) setRange(revealRange(total, focusIndex));
  }

  const visible = useMemo(() => (start > 0 || end < total ? items.slice(start, end) : items), [items, start, end, total]);
  const latest = () => {
    setRange(null);
    setShown(TIMELINE_WINDOW);
  };

  return {
    visible,
    /** 窓の外（上）にある項目の数 */
    hidden: start,
    /** 窓の外（下）にある項目の数（途中の一部分を描いているとき） */
    hiddenAfter: total - end,
    showMore: () => {
      if (range) setRange({ ...range, start: Math.max(0, start - TIMELINE_WINDOW) });
      else setShown((s) => Math.max(s, total - start) + TIMELINE_WINDOW);
    },
    /** 下の項目を足す（最新まで届いたら、そこからは新しい項目も描く） */
    showLater: () => {
      if (!range || range.end === null) return;
      const next = end + TIMELINE_WINDOW;
      setRange({ start, end: next >= total ? null : next });
    },
    /**
     * 一番下（最新）へ戻った: 窓を元の大きさに戻す（上の項目を外しても、一番下のまま）。途中の一部分を描いているときは何もしない。
     * 上に項目を足すと読んでいた位置がずれる（移った先が下へ押し出される）ので、外すだけにする
     */
    atBottom: () => {
      if (range?.end != null) return;
      setRange(null);
      setShown((s) => Math.min(range ? total - start : s, TIMELINE_WINDOW));
    },
    /** 最新の項目を描く窓に戻す（一番下へ戻るボタン・⌘↓） */
    latest,
    /** 記録の ID の発言を描くようにする。すでに描いていれば true（すぐ移れる）、窓を動かしたら false（描いたあとに移る） */
    reveal: (eventId: number): boolean => {
      const index = itemIndexOfEvent(items, eventId);
      if (index < 0 || (index >= start && index < end)) return true;
      setRange(revealRange(total, index));
      return false;
    },
  };
}
