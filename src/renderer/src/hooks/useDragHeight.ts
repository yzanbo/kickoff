import { useRef, useState, type PointerEvent } from "react";
import { startVerticalDrag } from "./dragResize";
import { useStoredNumber } from "./useStoredState";

/**
 * 欄の高さを、境目のつまみのドラッグで変える（ダブルクリックで元の高さ。覚えておく）。useDragWidth の縦版。
 * side: "bottom" = 下の欄（つまみは上端）/ "top" = 上の欄（つまみは下端）。
 * 高さは min から、反対側を keep だけ残すところまで。paneRef を欄に、handle をつまみに渡す
 */
export function useDragHeight({
  storageKey,
  initial,
  min = 120,
  keep = 120,
  side = "bottom",
  cssVar,
}: {
  storageKey: string;
  initial: number;
  min?: number;
  keep?: number;
  side?: "top" | "bottom";
  /** ドラッグ中に書き換える CSS 変数（開閉の動きのために高さを変数で持つ欄。なければ height を書き換える） */
  cssVar?: string;
}) {
  const [height, setHeight] = useStoredNumber(storageKey, initial);
  const [resizing, setResizing] = useState(false);
  const paneRef = useRef<HTMLElement>(null);

  const start = (e: PointerEvent<HTMLElement>) => {
    const pane = paneRef.current;
    const total = pane?.parentElement?.clientHeight;
    if (!pane || !total) return;
    const { top, bottom } = pane.getBoundingClientRect();
    let next = height;
    setResizing(true);
    startVerticalDrag(e, {
      // ドラッグ中は描き直さず、高さだけを書き換えて指に追従させる
      move: (clientY) => {
        next = Math.round(Math.max(min, Math.min(total - keep, side === "bottom" ? bottom - clientY : clientY - top)));
        if (cssVar) pane.style.setProperty(cssVar, `${next}px`);
        else pane.style.height = `${next}px`;
      },
      end: () => {
        setResizing(false);
        setHeight(next);
      },
    });
  };

  return {
    height,
    resizing,
    paneRef,
    /** つまみ（境目）に渡す */
    handle: {
      role: "separator",
      "aria-orientation": "horizontal" as const,
      title: "ドラッグで高さを変える（ダブルクリックで元に戻す）",
      onPointerDown: start,
      onDoubleClick: () => setHeight(initial),
    },
  };
}
