import { useRef, useState, type PointerEvent } from "react";
import { startHorizontalDrag } from "./dragResize";
import { useStoredNumber } from "./useStoredState";

/**
 * 左の欄の幅を、右端のつまみのドラッグで変える（ダブルクリックで元の幅。覚えておく）。
 * 幅は min から、右側を keep だけ残すところまで。paneRef を左の欄に、handle をつまみに渡す
 */
export function useDragWidth({ storageKey, initial, min = 200, keep = 320 }: { storageKey: string; initial: number; min?: number; keep?: number }) {
  const [width, setWidth] = useStoredNumber(storageKey, initial);
  const [resizing, setResizing] = useState(false);
  const paneRef = useRef<HTMLElement>(null);

  const start = (e: PointerEvent<HTMLElement>) => {
    const pane = paneRef.current;
    const total = pane?.parentElement?.clientWidth;
    if (!pane || !total) return;
    const left = pane.getBoundingClientRect().left;
    let next = width;
    setResizing(true);
    startHorizontalDrag(e, {
      // ドラッグ中は描き直さず、幅だけを書き換えて指に追従させる
      move: (clientX) => {
        next = Math.round(Math.max(min, Math.min(total - keep, clientX - left)));
        pane.style.width = `${next}px`;
      },
      end: () => {
        setResizing(false);
        setWidth(next);
      },
    });
  };

  return {
    width,
    resizing,
    paneRef,
    /** つまみ（境目）に渡す */
    handle: {
      role: "separator",
      "aria-orientation": "vertical" as const,
      title: "ドラッグで幅を変える（ダブルクリックで元に戻す）",
      onPointerDown: start,
      onDoubleClick: () => setWidth(initial),
    },
  };
}
