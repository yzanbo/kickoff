import { useEffect, useState, type RefObject } from "react";
import { observeSize } from "@/foundation/ui/hooks/useSizeObserver";

interface WindowInput {
  count: number;
  rowHeight: number;
  /** 見えている範囲の上下に余分に描く行の数 */
  overscan: number;
  scrollTop: number;
  /** スクロールする入れ物の見えている高さ */
  viewport: number;
}

/** 固定の高さの行のうち、描く範囲（first〜last。行がなければ last は -1） */
export function fixedWindowRange({ count, rowHeight, overscan, scrollTop, viewport }: WindowInput): { first: number; last: number } {
  if (count <= 0 || rowHeight <= 0) return { first: 0, last: count - 1 };
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count - 1, Math.ceil((scrollTop + viewport) / rowHeight) - 1 + overscan);
  return { first, last: Math.max(first - 1, last) };
}

/** index の行が見えるまでスクロールしたあとの scrollTop（見えていれば null） */
export function scrollTopFor(index: number, rowHeight: number, scrollTop: number, viewport: number): number | null {
  const top = index * rowHeight;
  if (top < scrollTop) return top;
  if (top + rowHeight > scrollTop + viewport) return top + rowHeight - viewport;
  return null;
}

/**
 * 固定の高さの行の窓（DB の表・長い木）。scroller のスクロールと大きさを見て、描く範囲と全体の高さを返す。
 * 行は totalHeight の箱の中に offsetOf(index) の位置で置く
 */
export function useFixedWindow({ count, rowHeight, overscan = 8, scroller }: { count: number; rowHeight: number; overscan?: number; scroller: RefObject<HTMLElement | null> }) {
  const [view, setView] = useState({ scrollTop: 0, viewport: 0 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => setView((v) => (v.scrollTop === el.scrollTop && v.viewport === el.clientHeight ? v : { scrollTop: el.scrollTop, viewport: el.clientHeight }));
    el.addEventListener("scroll", read, { passive: true });
    const stop = observeSize(el, read);
    return () => {
      el.removeEventListener("scroll", read);
      stop();
    };
  }, [scroller]);
  const { first, last } = fixedWindowRange({ count, rowHeight, overscan, ...view });
  return {
    first,
    last,
    totalHeight: count * rowHeight,
    offsetOf: (index: number) => index * rowHeight,
    scrollToIndex: (index: number) => {
      const el = scroller.current;
      const top = el ? scrollTopFor(index, rowHeight, el.scrollTop, el.clientHeight) : null;
      if (el && top !== null) el.scrollTo({ top });
    },
  };
}
