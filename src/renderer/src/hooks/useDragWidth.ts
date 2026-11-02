import { useRef, useState, type PointerEvent } from "react";
import { startHorizontalDrag } from "./dragResize";
import { useStoredNumber } from "./useStoredState";

/**
 * 欄の幅を、境目のつまみのドラッグで変える（ダブルクリックで元の幅。覚えておく）。
 * side: "left" = 左の欄（つまみは右端）/ "right" = 右の欄（つまみは左端）。
 * 幅は min から、反対側を keep だけ残すところまで。paneRef を欄に、handle をつまみに渡す
 */
export function useDragWidth({
  storageKey,
  initial,
  min = 200,
  keep = 320,
  side = "left",
}: {
  storageKey: string;
  initial: number;
  min?: number;
  keep?: number;
  side?: "left" | "right";
}) {
  const [width, setWidth] = useStoredNumber(storageKey, initial);
  const [resizing, setResizing] = useState(false);
  const paneRef = useRef<HTMLElement>(null);

  const start = (e: PointerEvent<HTMLElement>) => {
    const pane = paneRef.current;
    const total = pane?.parentElement?.clientWidth;
    if (!pane || !total) return;
    const { left, right } = pane.getBoundingClientRect();
    let next = width;
    setResizing(true);
    startHorizontalDrag(e, {
      // ドラッグ中は描き直さず、幅だけを書き換えて指に追従させる
      move: (clientX) => {
        next = Math.round(Math.max(min, Math.min(total - keep, side === "left" ? clientX - left : right - clientX)));
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
