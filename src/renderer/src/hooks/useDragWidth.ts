import { useRef, useState, type PointerEvent } from "react";
import type { Setting } from "@/lib/storage";
import { startHorizontalDrag } from "./dragResize";
import { useSetting } from "./useSetting";

/**
 * 欄の幅を、境目のつまみのドラッグで変える（setting に覚える。ダブルクリックで setting の初めの幅に戻す）。
 * side: "left" = 左の欄（つまみは右端）/ "right" = 右の欄（つまみは左端）。
 * 幅は min から、反対側を keep だけ残すところまで。paneRef を欄に、handle をつまみに渡す
 */
export function useDragWidth({
  setting,
  min = 200,
  keep = 320,
  side = "left",
  cssVar,
}: {
  setting: Setting<number>;
  min?: number;
  keep?: number;
  side?: "left" | "right";
  /** ドラッグ中に書き換える CSS 変数（開閉の動きのために幅を変数で持つ欄。なければ width を書き換える） */
  cssVar?: string;
}) {
  const [width, setWidth] = useSetting(setting);
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
        if (cssVar) pane.style.setProperty(cssVar, `${next}px`);
        else pane.style.width = `${next}px`;
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
      onDoubleClick: () => setWidth(setting.initial),
    },
  };
}
