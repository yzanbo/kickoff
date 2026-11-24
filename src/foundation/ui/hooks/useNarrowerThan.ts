import { useLayoutEffect, useRef, useState } from "react";
import { observeSize } from "./useSizeObserver";

/**
 * 要素の横幅が width より狭いか（共有の見張り observeSize で測り直す）。ref は測る要素に渡す。隠れて幅 0 の間は切り替えない（右の欄の裏のタブなど）。
 * 狭い欄では並べ方を変える（左右に並べる差分を 1 列にする・一覧と詳細を 1 つずつ出すなど。設定そのものは変えない）ときに使う
 */
export function useNarrowerThan<T extends HTMLElement>(width: number) {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => el.clientWidth > 0 && setNarrow(el.clientWidth < width);
    check();
    return observeSize(el, check);
  }, [width]);
  return { ref, narrow };
}
