import { useLayoutEffect, useRef, useState, type UIEvent } from "react";

/** 最新（いちばん下）を見ているとみなす、下端からの距離 */
const FOLLOW_SLACK_PX = 24;

/**
 * 中身が伸びていく欄のスクロール（ターミナルと同じ）: live の間は最新（いちばん下）に付いていき、中で上へ戻したら止まる
 * （いちばん下へ戻せばまた付いていく）。live でなくなったら付いていくのをやめる（読み返している位置を動かさない）。
 * 初めは live なら下から、そうでなければ上から。paused の間は付いていかない（「全体を表示」で欄の高さの制限を外したとき）。
 * scrollRef をスクロールする要素、contentRef を中身に付け、onScroll をスクロールする要素に渡す。overflowing は中身がはみ出しているか
 */
export function useFollowScroll<E extends HTMLElement = HTMLDivElement, C extends HTMLElement = HTMLDivElement>(live: boolean, paused = false) {
  const scrollRef = useRef<E>(null);
  const contentRef = useRef<C>(null);
  const following = useRef(live);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    if (!live) following.current = false;
  }, [live]);
  // 中身が伸びたら（新しい手順・入れ子のカードを開いた・結果が届いた）、付いていく間はいちばん下へ。はみ出しているかも測り直す
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const update = () => {
      if (following.current && !paused) scroller.scrollTop = scroller.scrollHeight;
      setOverflowing(scroller.scrollHeight > scroller.clientHeight + 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, [paused]);
  const onScroll = (e: UIEvent<E>) => {
    const el = e.currentTarget;
    following.current = live && el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
  };
  return { scrollRef, contentRef, overflowing, onScroll };
}
