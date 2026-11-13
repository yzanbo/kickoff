import { useEffect, useRef, useState } from "react";

/**
 * 左の一覧と右の中身を横に並べる画面で、中身の欄に minDetail が残らない幅か（右の欄など。狭ければ一覧と中身を切り替えて 1 つずつ出す）。
 * 幅は根の要素（ref）を ResizeObserver で測る。隠れて幅 0 の間は切り替えない（右の欄の裏のタブなど）
 */
export function useNarrowSplit<T extends HTMLElement>(listWidth: number, minDetail: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const narrow = width !== null && width > 0 && width < listWidth + minDetail;
  return { ref, narrow };
}
