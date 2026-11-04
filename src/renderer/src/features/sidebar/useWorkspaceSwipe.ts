import { useCallback, useLayoutEffect, useRef, type PointerEvent, type WheelEvent } from "react";

/** スワイプで隣へ移るのに必要な移動量（ページの幅・高さに対する割合） */
const SWIPE_RATIO = 0.18;
/** この時間ホイールのイベントが途切れたら、1 回のジェスチャー（慣性を含む）が終わったとみなす */
const GESTURE_END_MS = 180;
/** 切り替えた直後に、次のスワイプを受け付けない時間（ms） */
const COOLDOWN_MS = 200;
/** 切り替えたあと、移動量がこの回数続けて増えたら、慣性ではなく次のスワイプとみなす（慣性は小さくなっていく一方） */
const RISING_TO_RESTART = 2;

/**
 * ページ（チャット一覧）がその向きにまだスクロールできるか（縦スライドでは、端まで来てから先の縦スワイプだけを切り替えに使う）
 */
function pageCanScroll(target: EventTarget | null, delta: number): boolean {
  const page = (target as HTMLElement | null)?.closest?.(".workspace-page");
  if (!page) return false;
  return delta > 0 ? page.scrollTop + page.clientHeight < page.scrollHeight - 1 : page.scrollTop > 0;
}

/**
 * サイドバーのスライド: トラックパッドの 2 本指スワイプ・タッチのドラッグで、隣のプロジェクトへ切り替える。
 * axis が "x" なら横（横スライド）、"y" なら縦（縦スライド）。縦は一覧のスクロールと同じ向きなので、
 * 一覧をスクロールしきった端から、続けて同じ向きにスワイプしたときだけ切り替える（スクロールの慣性では切り替えない）。
 * 指に追従させる間は React の再描画を挟まず、要素の transform を直接動かす
 */
export function useWorkspaceSwipe({
  index,
  count,
  go,
  active = true,
  axis = "x",
}: {
  index: number;
  count: number;
  go: (to: number) => void;
  active?: boolean;
  axis?: "x" | "y";
}) {
  const vertical = axis === "y";
  // 縦スライドで、最後に一覧をスクロールした時刻（そのジェスチャーの続き・慣性は切り替えに使わない）
  const lastScroll = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 1 回のスワイプの状態。committed: すでに切り替えた（次のスワイプが始まるまで、残りの慣性のイベントは無視する）
  const gesture = useRef<{
    total: number;
    timer?: ReturnType<typeof setTimeout>;
    active: boolean;
    committed: boolean;
    committedAt: number;
    /** 直前のイベントの移動量 */
    prevAbs: number;
    /** 移動量が続けて増えた回数 */
    rising: number;
  }>({ total: 0, active: false, committed: false, committedAt: 0, prevAbs: 0, rising: 0 });

  /**
   * スライド位置を要素に直接反映する（指に追従させる間は React の再描画を挟まない）。
   * offset は指で動かしている量（px）。0 ならアニメーションで index の位置へ戻る。
   */
  const place = useCallback(
    (offset: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.classList.toggle("dragging", offset !== 0);
      track.style.transform = `${vertical ? "translateY" : "translateX"}(calc(${-index * 100}% - ${offset}px))`;
    },
    [index, vertical],
  );

  // 縦並びから横スライドに切り替えたとき（スライドの要素が新しくできたとき）も、いまのプロジェクトの位置に合わせる
  useLayoutEffect(() => {
    if (active) place(0);
  }, [place, active]);

  /** スワイプの向きのページの大きさ（横は幅、縦は高さ） */
  const width = () => (vertical ? viewportRef.current?.clientHeight : viewportRef.current?.clientWidth) ?? 260;
  /** 端のプロジェクトより先へは動かさない（動くと、移れないのに移れそうに見えるため） */
  const resist = (offset: number) => {
    const atStart = index === 0 && offset < 0;
    const atEnd = index === count - 1 && offset > 0;
    return atStart || atEnd ? 0 : offset;
  };

  /** 移動量がしきい値を超えたら、その場で隣へ切り替える */
  const commitIfFar = (total: number): boolean => {
    const threshold = width() * SWIPE_RATIO;
    if (total > threshold && index < count - 1) {
      go(index + 1);
      return true;
    }
    if (total < -threshold && index > 0) {
      go(index - 1);
      return true;
    }
    return false;
  };

  // トラックパッドの 2 本指スワイプ（横スライドは横方向、縦スライドは縦方向のホイール）
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    wheel(e, vertical ? e.deltaY : e.deltaX, vertical ? e.deltaX : e.deltaY, true);
  }

  /**
   * 丸の帯（横スライドは下・縦スライドは左）の上の 2 本指スワイプ。
   * 横スライドは横方向だけ（縦のホイールは帯の横スクロールに使う）、縦スライドは縦・横のどちらでも（右・下 = 次）
   */
  function onStripWheel(e: WheelEvent<HTMLDivElement>) {
    if (vertical) {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheel(e, delta, 0, false);
    } else {
      wheel(e, e.deltaX, e.deltaY, false);
    }
  }

  /** delta: スワイプの向きの移動量、cross: 違う向きの移動量。inPage: ページ（一覧）の上か（縦スライドで、一覧のスクロールを先にする） */
  function wheel(e: WheelEvent<HTMLDivElement>, delta: number, cross: number, inPage: boolean) {
    const g = gesture.current;
    if (!g.active) {
      if (Math.abs(delta) <= Math.abs(cross)) return; // 違う向きのスクロールはそのまま
      if (vertical && inPage) {
        const now = performance.now();
        // 一覧がまだスクロールできる・スクロールの続き（慣性）なら、ふつうにスクロールさせる
        if (pageCanScroll(e.target, delta) || now - lastScroll.current < GESTURE_END_MS) {
          lastScroll.current = now;
          return;
        }
      }
    }
    g.active = true;
    clearTimeout(g.timer);
    g.timer = setTimeout(() => {
      // ジェスチャーの終わり: 切り替えていなければ元の位置へ戻す
      if (!g.committed) place(0);
      g.total = 0;
      g.active = false;
      g.committed = false;
    }, GESTURE_END_MS);
    // 1 回のスワイプ（指を離したあとの慣性を含む）では 1 つだけ移る。切り替えたあとの慣性のイベントは無視し、
    // 移動量が続けて増えたら（慣性は小さくなっていく一方なので）次のスワイプとして受け付ける（2 回スワイプしたら 2 つ移る）
    if (g.committed) {
      const abs = Math.abs(delta);
      g.rising = abs > g.prevAbs + 2 ? g.rising + 1 : 0;
      g.prevAbs = abs;
      if (performance.now() - g.committedAt < COOLDOWN_MS || g.rising < RISING_TO_RESTART) return;
      g.committed = false;
      g.total = 0;
    }
    g.total += delta;
    if (commitIfFar(g.total)) {
      g.committed = true;
      g.committedAt = performance.now();
      g.prevAbs = Math.abs(delta);
      g.rising = 0;
      return;
    }
    place(resist(Math.max(-width(), Math.min(width(), g.total))));
  }

  // スマホなどのタッチ・ドラッグ
  // along: スワイプの向きに動かしているか（決まるまで undefined）。縦スライドでは、一覧がその向きにスクロールできるならスクロールに任せる
  const pointer = useRef<{ id: number; x: number; y: number; along?: boolean } | null>(null);
  const moved = (p: { x: number; y: number }, e: PointerEvent<HTMLDivElement>) => (vertical ? p.y - e.clientY : p.x - e.clientX);
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = p.x - e.clientX;
    const dy = p.y - e.clientY;
    if (p.along === undefined && Math.hypot(dx, dy) > 8) {
      const alongAxis = vertical ? Math.abs(dy) > Math.abs(dx) : Math.abs(dx) > Math.abs(dy);
      p.along = alongAxis && !(vertical && pageCanScroll(e.target, dy));
    }
    if (p.along) place(resist(moved(p, e)));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.along && !commitIfFar(moved(p, e))) place(0);
    pointer.current = null;
  }

  return {
    viewportRef,
    trackRef,
    /** 丸の帯（workspace-switcher）に渡す（帯の上のスワイプでも切り替える） */
    stripHandlers: { onWheel: onStripWheel },
    /** スライドの枠（viewport）に渡す */
    handlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: () => {
        pointer.current = null;
        place(0);
      },
    },
  };
}
