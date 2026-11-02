import { useCallback, useLayoutEffect, useRef, type PointerEvent, type WheelEvent } from "react";

/** 横スワイプで隣へ移るのに必要な移動量（ページ幅に対する割合） */
const SWIPE_RATIO = 0.18;
/** この時間ホイールのイベントが途切れたら、1 回のジェスチャー（慣性を含む）が終わったとみなす */
const GESTURE_END_MS = 180;
/** 端のプロジェクトより先へ引っ張れる最大量（px） */
const EDGE_PULL_MAX = 36;

/**
 * サイドバーの横スライド: トラックパッドの 2 本指スワイプ・タッチのドラッグで、隣のプロジェクトへ切り替える。
 * 指に追従させる間は React の再描画を挟まず、要素の transform を直接動かす
 */
export function useWorkspaceSwipe({ index, count, go }: { index: number; count: number; go: (to: number) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 1 回のスワイプの状態。committed: すでに切り替えた（ジェスチャーが終わるまで、残りの慣性のイベントはすべて無視する）
  const gesture = useRef<{
    total: number;
    timer?: ReturnType<typeof setTimeout>;
    active: boolean;
    committed: boolean;
  }>({ total: 0, active: false, committed: false });

  /**
   * スライド位置を要素に直接反映する（指に追従させる間は React の再描画を挟まない）。
   * offset は指で動かしている量（px）。0 ならアニメーションで index の位置へ戻る。
   */
  const place = useCallback(
    (offset: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.classList.toggle("dragging", offset !== 0);
      track.style.transform = `translateX(calc(${-index * 100}% - ${offset}px))`;
    },
    [index],
  );

  useLayoutEffect(() => place(0), [place]);

  const width = () => viewportRef.current?.clientWidth ?? 260;
  /** 端のプロジェクトより先へは、少しだけ動いて戻る（ゴムのような抵抗） */
  const resist = (offset: number) => {
    const atStart = index === 0 && offset < 0;
    const atEnd = index === count - 1 && offset > 0;
    if (!atStart && !atEnd) return offset;
    return Math.sign(offset) * Math.min(EDGE_PULL_MAX, Math.abs(offset) / 4);
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

  // トラックパッドの 2 本指スワイプ（横方向のホイール）
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g.active && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 縦スクロールはそのまま
    g.active = true;
    clearTimeout(g.timer);
    g.timer = setTimeout(() => {
      // ジェスチャーの終わり: 切り替えていなければ元の位置へ戻す
      if (!g.committed) place(0);
      g.total = 0;
      g.active = false;
      g.committed = false;
    }, GESTURE_END_MS);
    // 1 回のジェスチャー（指を離したあとの慣性を含む）では 1 つだけ移る。切り替えたあとのイベントは、途切れるまですべて無視する
    // （慣性を次のスワイプと取り違えて、いくつも先のプロジェクトまで動かないように。続けて移るときは、止まってからもう一度スワイプする）
    if (g.committed) return;
    g.total += e.deltaX;
    if (commitIfFar(g.total)) {
      g.committed = true;
      return;
    }
    place(resist(Math.max(-width(), Math.min(width(), g.total))));
  }

  // スマホなどのタッチ・ドラッグ
  const pointer = useRef<{ id: number; x: number; y: number; horizontal?: boolean } | null>(null);
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = p.x - e.clientX;
    const dy = p.y - e.clientY;
    if (p.horizontal === undefined && Math.hypot(dx, dy) > 8) p.horizontal = Math.abs(dx) > Math.abs(dy);
    if (p.horizontal) place(resist(dx));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.horizontal && !commitIfFar(p.x - e.clientX)) place(0);
    pointer.current = null;
  }

  return {
    viewportRef,
    trackRef,
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
