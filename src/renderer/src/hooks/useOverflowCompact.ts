import { useLayoutEffect, useRef, useState } from "react";

/**
 * 中身が横にあふれるときだけ詰めた表示（compact）にする。決め打ちの幅で切り替えると、文言やボタンの数が変わったときに、
 * 切り替わる前にはみ出したり、まだ入るのに詰めたりしたため、実際にあふれるかで決める。
 * ふつうの表示であふれたら、そのときの中身の幅を覚えて詰め、要素がその幅まで広がったら戻す（詰めた表示のままでは、戻して入るかを測れないため）。
 * resetKey が変わったら（行が増えた・減ったなど、ふつうの表示の幅が変わるとき）、いったん戻して測り直す（描く前に済むので、ちらつかない）。
 * ref は横幅を測る要素（あふれるときに scrollWidth が clientWidth を超える要素）に渡す
 */
export function useOverflowCompact<T extends HTMLElement>(resetKey: unknown) {
  const ref = useRef<T>(null);
  const [compact, setCompact] = useState(false);
  // ふつうの表示に必要な幅（あふれたときに測った中身の幅）
  const needed = useRef(0);

  // 行が増えた・減ったときは、ふつうの表示に戻して測り直す
  useLayoutEffect(() => {
    needed.current = 0;
    setCompact(false);
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!compact) {
        if (el.scrollWidth > el.clientWidth) {
          needed.current = el.scrollWidth;
          setCompact(true);
        }
      } else if (el.clientWidth >= needed.current) {
        setCompact(false);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact, resetKey]);

  return { ref, compact };
}
