import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** 左右の端の先に、まだ隠れている中身があるか（その側を薄くぼかす） */
export interface ScrollEdges {
  start: boolean;
  end: boolean;
}

/**
 * 横にスクロールする列（定型文の帯）。縦のホイールも横に動かし（マウスでも送れるように。横にあふれていないときと、
 * 横のスクロールの操作（トラックパッドの横スワイプ）はそのまま）、左右にまだ中身があるかを返す。
 * deps が変わったら（中身が変わった）測り直す
 */
export function useHorizontalScroller(deps: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  // React の onWheel は passive で止められないので、自分で受ける
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      resize.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [deps, measure]);
  return { ref, edges, onScroll: measure };
}
