import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";
import { canPan, clampView, fitView, panBy, zoomTo, ZOOM_STEP, type Size, type View } from "./imageZoom";

/** ピンチ・Ctrl ＋ ホイールの 1 回で動かす量の上限（ホイールの 1 目盛りで倍率が跳ばないように） */
const WHEEL_DELTA_LIMIT = 50;
/** ピンチ・Ctrl ＋ ホイールの、動かした量あたりの倍率の変わり方 */
const WHEEL_ZOOM_RATE = 0.01;

const ZERO: Size = { width: 0, height: 0 };

/**
 * 画像の拡大・縮小とドラッグでの移動（画像を大きく見る）。
 * 初めは「画面に合わせる」（zoomed が undefined の間は、画面の大きさが変わっても合わせ直す）。
 * ピンチ（Chromium では ctrlKey 付きの wheel）・Ctrl ＋ ホイールで指した位置を中心に拡大・縮小し、
 * はみ出しているときはドラッグ・2 本指のスクロールで動かせる
 */
export function useImageZoom() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Size>(ZERO);
  const [natural, setNatural] = useState<Size>();
  const [zoomed, setZoomed] = useState<View>();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  // 直前のつかみで動かしたか（動かしたあとのクリックで閉じないように）
  const moved = useRef(false);

  // 画像を出す枠の大きさ（画面に合わせる倍率と、はみ出しの判定に使う）
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const size = natural ?? ZERO;
  const view = zoomed ? clampView(zoomed, size, stage) : fitView(size, stage);
  const pannable = natural !== undefined && canPan(view, natural, stage);

  /** 枠の中央からの位置 */
  const pointOf = (clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 } : { x: 0, y: 0 };
  };
  /** 倍率を変える（factor 倍、または scale ちょうど）。point を指定しなければ中央を中心にする */
  const zoomBy = (next: (scale: number) => number, point = { x: 0, y: 0 }) => {
    if (!natural) return;
    setZoomed((z) => {
      const current = z ?? fitView(natural, stage);
      return zoomTo(current, next(current.scale), point, natural, stage);
    });
  };

  // ピンチ・ホイール（React の onWheel は passive で preventDefault できないので、直接登録する）
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!natural) return;
    if (e.ctrlKey) {
      const delta = Math.max(-WHEEL_DELTA_LIMIT, Math.min(WHEEL_DELTA_LIMIT, e.deltaY));
      zoomBy((s) => s * Math.exp(-delta * WHEEL_ZOOM_RATE), pointOf(e.clientX, e.clientY));
    } else {
      setZoomed((z) => z && panBy(z, -e.deltaX, -e.deltaY, natural, stage));
    }
  };
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);

  /** 画面に合わせる ⇔ 100%（実寸）。実寸にするときは point（枠の中央からの位置）を中心にする */
  const toggleActual = (point?: { x: number; y: number }) => (zoomed === undefined ? zoomBy(() => 1, point) : setZoomed(undefined));

  const endDrag = () => {
    drag.current = undefined;
    setDragging(false);
  };

  return {
    stageRef,
    /** 倍率（%） */
    percent: Math.round(view.scale * 100),
    /** 画面に合わせているか */
    fitted: zoomed === undefined,
    pannable,
    dragging,
    zoomIn: () => zoomBy((s) => s * ZOOM_STEP),
    zoomOut: () => zoomBy((s) => s / ZOOM_STEP),
    /** 画面に合わせる */
    fit: () => setZoomed(undefined),
    toggleActual: () => toggleActual(),
    /** 直前のつかみで画像を動かしたか（動かしたあとのクリックを無視するため） */
    justDragged: () => moved.current,
    /** 枠に渡す（はみ出しているときはドラッグで動かす） */
    stageProps: {
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        moved.current = false;
        if (!pannable || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY };
        setDragging(true);
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || !natural) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (dx === 0 && dy === 0) return;
        drag.current = { x: e.clientX, y: e.clientY };
        moved.current = true;
        setZoomed((z) => panBy(z ?? fitView(natural, stage), dx, dy, natural, stage));
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    /** 画像に渡す（読み込んだら元の大きさを覚える。ダブルクリックで画面に合わせる ⇔ 実寸） */
    imageProps: {
      draggable: false,
      onLoad: (e: SyntheticEvent<HTMLImageElement>) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }),
      onDoubleClick: (e: MouseEvent<HTMLImageElement>) => toggleActual(pointOf(e.clientX, e.clientY)),
      style: natural
        ? ({
            "--img-w": `${natural.width * view.scale}px`,
            "--img-h": `${natural.height * view.scale}px`,
            "--img-x": `${view.x}px`,
            "--img-y": `${view.y}px`,
          } as CSSProperties)
        : undefined,
    },
  };
}
