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

/**
 * useOverflowCompact の段が何段もあるもの。中身が横に入らなければ 1 段ずつ詰め（level を 1 つ上げて、詰めた中身でまた測る）、
 * 要素が「その段で入らなかった幅」まで広がったら 1 段戻す（詰めた表示のままでは、戻して入るかを測れないため。行ったり来たりしない）。
 * 0 がふつうの表示、maxLevel がいちばん詰めた表示（それでも入らなければそのまま）。
 * resetKey が変わったら（中身が増えた・減ったなど）、ふつうの表示に戻して測り直す（描く前に済むので、ちらつかない）
 */
export function useOverflowLevel<T extends HTMLElement>(maxLevel: number, resetKey: unknown, slack = DEFAULT_SLACK) {
  const ref = useRef<T>(null);
  const [level, setLevel] = useState(0);
  // needed[n] = 段 n で入らなかったときの、その段の中身の幅 ＋ ゆとり（ここまで広がれば段 n に戻せる）
  const needed = useRef<number[]>([]);
  const measuredKey = useRef(resetKey);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 中身が変わったら、覚えた幅を捨ててふつうの表示から測り直す（同じ描き直しの中で、古い段のまま測って段を上げないように、ここで先に戻す）
    if (measuredKey.current !== resetKey) {
      measuredKey.current = resetKey;
      needed.current = [];
      if (level > 0) {
        setLevel(0);
        return;
      }
    }
    const check = () => {
      // 隠れている間（display: none で幅 0）は測らない（すべて入らないと見て、いちばん詰めた段まで進んでしまう）
      if (el.clientWidth === 0) return;
      if (level > 0 && el.clientWidth >= needed.current[level - 1]) {
        setLevel(level - 1);
        return;
      }
      if (level < maxLevel) {
        const width = maxContentWidth(el) + slack;
        if (width > el.clientWidth) {
          needed.current[level] = width;
          setLevel(level + 1);
        }
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [level, maxLevel, resetKey, slack]);

  return { ref, level };
}

/**
 * 折り返して並ぶ中身（el の子）の段の数（見えていない子は数えない）。上下の真ん中にそろえると高さの違う子は上端がずれるので、
 * 前の段の下端より下から始まる子だけを新しい段に数える
 */
function wrappedRows(el: HTMLElement): number {
  const boxes = [...el.children]
    .filter((child) => child.getClientRects().length > 0)
    .map((child) => child.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);
  let rows = 0;
  let bottom = -Infinity;
  for (const box of boxes) {
    if (box.top >= bottom - 1) {
      rows += 1;
      bottom = box.bottom;
    } else {
      bottom = Math.max(bottom, box.bottom);
    }
  }
  return rows;
}

/**
 * 折り返して並ぶ道具（flex-wrap の子）が maxRows 段に入らないときだけ詰めた表示（compact）にする（ボードの見出し: 2 段までは文字のまま、
 * 3 段目が要るときだけアイコンにする）。決め打ちの幅では切り替えず、詰めた表示のときも compactClass をいったん外して、ふつうの表示での段の数を測る
 * （測ったらすぐ戻す。描く前なので画面は動かない）。要素と親の大きさが変わったとき・中身（ボタン・文言）が変わったときに測り直す。
 * 要素が隠れている・display: contents（幅 0）の間は測らない（狭いときの並べ方を CSS が持つとき）
 */
export function useWrapCompact<T extends HTMLElement>(maxRows: number, compactClass: string) {
  const ref = useRef<T>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.clientWidth === 0) return;
      const had = el.classList.contains(compactClass);
      if (had) el.classList.remove(compactClass);
      const over = wrappedRows(el) > maxRows;
      if (had) el.classList.add(compactClass);
      setCompact(over);
    };
    check();
    const resize = new ResizeObserver(check);
    resize.observe(el);
    // 詰めた表示で 1 段に収まっていると、見出しが広がっても要素の幅は変わらないので、親の大きさも見る
    if (el.parentElement) resize.observe(el.parentElement);
    const mutation = new MutationObserver(check);
    mutation.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [maxRows, compactClass]);

  return { ref, compact };
}
