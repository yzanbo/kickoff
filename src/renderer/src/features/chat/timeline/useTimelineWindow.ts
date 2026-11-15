import { useEffect, useMemo, useState } from "react";
import { itemIndexOfEvent, revealRange, TIMELINE_WINDOW, windowStart, type WindowRange } from "./timelineWindow";
import type { TimelineItem } from "./timelineItems";
import type { TimelineScroll } from "./timelineScroll";

/** 読んでいない記録の読み足し（チャットの店。メモの仕様書「0023_表示を軽くする」の案 4） */
export interface TimelinePaging {
  /** 流れに出す記録より前に、読んでいない記録があるか */
  hasEarlier: boolean;
  /** 途中の一部分を出しているか（下に末尾がある） */
  focused: boolean;
  loadEarlier: () => Promise<void>;
  loadLater: () => Promise<void>;
  backToTail: () => void;
}

/**
 * チャットの流れの窓（最近の項目だけを描く。timelineWindow.ts）。
 * - ふだんは最新から shown 件。上の端まで戻ったら showMore で前を足す
 * - 一番下へ戻った・一番下を見ている間に新しい項目が届いたら、窓を元の大きさに戻す（長く開いていても描く量が増えていかない）
 * - 検索結果から開いた発言（focus）・移り先（reveal）が窓の外なら、その前後を描く範囲（range）にする。
 *   最新から遠ければ途中の一部分だけを描き（下の端まで来たら showLater で後ろを足す）、最新へは latest で戻る。
 *   チャットの中の検索も記録から探して移り先だけを描く（すべて描くと、数千ターンのチャットで画面が落ちる）
 * - 記録は末尾だけを読んでいるので、窓の上の端まで来て前に読んでいない記録があれば読み足し（log.loadEarlier）、届いたら窓を前へ広げる。
 *   途中の一部分を出しているときは、下の端で後ろを読み足し（loadLater）、最新へ戻るときは末尾に戻す（backToTail）
 */
export function useTimelineWindow({
  items,
  chatId,
  focus,
  scroll,
  log,
}: {
  items: TimelineItem[];
  chatId: number;
  focus?: number;
  /** 一番下に付いていくか（付いていく間に新しい項目が届いたら、窓を元の大きさに戻す） */
  scroll: TimelineScroll;
  log?: TimelinePaging;
}) {
  const [shown, setShown] = useState(TIMELINE_WINDOW);
  // 移り先の前後を描いているとき（null = 最新から shown 件）
  const [range, setRange] = useState<WindowRange | null>(null);
  useEffect(() => {
    setShown(TIMELINE_WINDOW);
    setRange(null);
  }, [chatId]);
  useEffect(() => {
    if (scroll.following()) setShown((s) => Math.min(s, TIMELINE_WINDOW));
  }, [items.length, scroll]);

  // 前に記録を足した（読み足した・遠い記録まで末尾を伸ばした）: 描いていた範囲を同じ項目のままずらし、読み足しを頼んでいたら前へ広げる
  const [head, setHead] = useState({ key: items[0]?.key, total: items.length });
  const [earlierAsked, setEarlierAsked] = useState(false);
  if (head.key !== items[0]?.key) {
    const added = head.key === undefined ? -1 : items.findIndex((item) => item.key === head.key);
    setHead({ key: items[0]?.key, total: items.length });
    if (added > 0) {
      if (range) {
        const moved = range.start + added;
        setRange({ start: earlierAsked ? Math.max(0, moved - TIMELINE_WINDOW) : moved, end: range.end === null ? null : range.end + added });
      } else if (earlierAsked) setShown((s) => Math.max(s, head.total) + TIMELINE_WINDOW);
      setEarlierAsked(false);
    }
  }

  const total = items.length;
  const start = range ? Math.min(range.start, total) : windowStart(total, shown);
  const end = range?.end == null ? total : Math.min(range.end, total);
  const focusedLog = log?.focused ?? false;

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
    if (focusedLog) log?.backToTail();
  };

  return {
    visible,
    /** 流れ全体の最後の項目（窓で途中を描いていても、作業中の文はいまの状態で決める） */
    last: items.at(-1),
    /** 窓の外（上）にある項目の数 */
    hidden: start,
    /** 上にまだ描ける項目・読める記録があるか */
    more: start > 0 || (log?.hasEarlier ?? false),
    /** 窓の外（下）にある項目の数（途中の一部分を描いているとき） */
    hiddenAfter: total - end,
    /** 下にまだ描ける項目・末尾があるか（途中の一部分を出している・その中の途中を描いている） */
    later: end < total || focusedLog,
    /** 前の項目を足す。描いていない項目がなければ前の記録を読み、読めたら足す（読んでいる間の Promise を返す） */
    showMore: (): Promise<void> | undefined => {
      if (start > 0) {
        if (range) setRange({ ...range, start: Math.max(0, start - TIMELINE_WINDOW) });
        else setShown((s) => Math.max(s, total - start) + TIMELINE_WINDOW);
        return undefined;
      }
      if (!log?.hasEarlier) return undefined;
      setEarlierAsked(true);
      return log.loadEarlier();
    },
    /** 下の項目を足す（最新まで届いたら、そこからは新しい項目も描く）。途中の一部分の終わりなら後ろの記録を読む */
    showLater: () => {
      if (range && range.end !== null) {
        const next = end + TIMELINE_WINDOW;
        setRange({ start, end: next >= total ? null : next });
        return;
      }
      if (focusedLog) void log?.loadLater();
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

/** 流れの窓（描く範囲と、それを動かす操作） */
export type TimelineWindow = ReturnType<typeof useTimelineWindow>;
