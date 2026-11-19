import { useLayoutEffect, useRef, useState } from "react";

/**
 * 要素の横幅が width より狭いか（ResizeObserver で測り直す）。ref は測る要素に渡す。
 * 狭い欄では並べ方を変える（左右に並べる差分を 1 列にするなど。設定そのものは変えない）ときに使う
 */
export function useNarrowerThan<T extends HTMLElement>(width: number) {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setNarrow(el.clientWidth > 0 && el.clientWidth < width);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  return { ref, narrow };
}
