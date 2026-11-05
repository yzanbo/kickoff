import { useLayoutEffect, useRef, useState } from "react";

/**
 * 中身の幅に足すゆとり（px）。ちょうど入る幅でも、ボタンの文字が枠にぴったり付くと窮屈に見えるため、ゆとりが残らなくなる手前で詰める
 * （サイドバーの見出しは、余った幅をボタンに配るので、ボタン 4 つに数 px ずつ残る）
 */
const DEFAULT_SLACK = 16;

/**
 * 要素を中身の幅（max-content）にしたときの幅（測ったらすぐ戻す。描く前なので画面は動かない）。
 * grid なら列もそれぞれの中身の幅にして測る（1fr の列は、中身の幅で測るとどれもいちばん広い列と同じ幅に広がり、実際より広く測れるため）
 */
function maxContentWidth(el: HTMLElement): number {
  const { width: prevWidth, gridTemplateColumns: prevColumns } = el.style;
  const style = getComputedStyle(el);
  if (style.display === "grid") {
    const count = style.gridTemplateColumns.split(" ").filter(Boolean).length;
    el.style.gridTemplateColumns = `repeat(${count}, max-content)`;
  }
  el.style.width = "max-content";
  const width = el.getBoundingClientRect().width;
  el.style.width = prevWidth;
  el.style.gridTemplateColumns = prevColumns;
  return width;
}

/**
 * 中身が横に入らないときだけ詰めた表示（compact）にする。決め打ちの幅で切り替えると、文言やボタンの数が変わったときに、
 * 切り替わる前にはみ出したり、まだ入るのに詰めたりしたため、実際の中身の幅で決める。
 * ふつうの表示の中身の幅（max-content）に slack のゆとりを足した幅が要素に入らなければ、その幅を覚えて詰め、要素がその幅まで広がったら戻す
 * （詰めた表示のままでは、戻して入るかを測れないため）。
 * resetKey が変わったら（行が増えた・減ったなど、ふつうの表示の幅が変わるとき）、いったん戻して測り直す（描く前に済むので、ちらつかない）。
 * ref は横幅を測る要素（中身に合わせて伸び縮みする要素。grid の列が 1fr でも max-content で測れる）に渡す
 */
export function useOverflowCompact<T extends HTMLElement>(resetKey: unknown, slack = DEFAULT_SLACK) {
  const ref = useRef<T>(null);
  const [compact, setCompact] = useState(false);
  // ふつうの表示に必要な幅（中身の幅 ＋ ゆとり）
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
        const width = maxContentWidth(el) + slack;
        if (width > el.clientWidth) {
          needed.current = width;
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
  }, [compact, resetKey, slack]);

  return { ref, compact };
}
