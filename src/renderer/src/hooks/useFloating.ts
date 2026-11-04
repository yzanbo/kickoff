import { useLayoutEffect, useRef, type RefObject } from "react";
import { placeFloating, type Placement } from "@/lib/floating";

/** 置いた位置を決めた値（同じなら置き直さない） */
function keyOf(at: Placement, width: number, height: number): string {
  const where = "x" in at ? `${at.x},${at.y}` : `${at.anchor.left},${at.anchor.top},${at.anchor.right},${at.anchor.bottom},${at.side},${at.align},${at.gap}`;
  return `${where}|${width},${height}|${window.innerWidth},${window.innerHeight}`;
}

/**
 * 浮かぶもの（ref の要素。メニュー・ポップオーバー）を top layer に出し（popover 属性があれば。ダイアログ・中を切り取る枠・
 * コンテナクエリの枠の上にも、画面を基準に出せる）、描いてから自分の大きさを測って place() の場所に置く（大きさの見積もりは要らない）。
 * 中身・画面の大きさが変わったら置き直す。place() が null なら動かさない。
 * track なら、開いている間は毎フレーム基準の要素の位置を確かめ、動いたら追う（送信待ちが増えてピルが上へ動いた、など）
 */
export function useFloating(ref: RefObject<HTMLElement | null>, place: () => Placement | null, { track = false }: { track?: boolean } = {}) {
  const placeRef = useRef(place);
  placeRef.current = place;
  const apply = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.popover && !el.matches(":popover-open")) el.showPopover();
    let last = "";
    apply.current = () => {
      const at = placeRef.current();
      if (!at) return;
      // 大きさは変形（開くときの動き）を含まない、並べたときの大きさで測る
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const key = keyOf(at, width, height);
      if (key === last) return;
      last = key;
      const { left, top } = placeFloating(at, { width, height }, { width: window.innerWidth, height: window.innerHeight });
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    apply.current();
    const run = () => apply.current();
    const observer = new ResizeObserver(run);
    observer.observe(el);
    window.addEventListener("resize", run);
    let frame = 0;
    const loop = () => {
      run();
      frame = requestAnimationFrame(loop);
    };
    if (track) frame = requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", run);
      cancelAnimationFrame(frame);
      apply.current = () => {};
    };
  }, [ref, track]);

  // 置く場所が変わった（同じメニューを別の位置で開き直した）ときも置き直す。追うときは毎フレーム確かめるので要らない
  useLayoutEffect(() => {
    if (!track) apply.current();
  });
}
