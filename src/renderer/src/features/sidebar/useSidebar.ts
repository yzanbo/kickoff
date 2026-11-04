import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { cx } from "@/lib/cx";
import { startHorizontalDrag } from "@/hooks/dragResize";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_OPEN, SIDEBAR_WIDTH } from "@/lib/storageKeys";

/** サイドバーの幅は 200〜480px（狭くしすぎ・広げすぎを防ぐ） */
function clampWidth(width: number): number {
  return Math.round(Math.max(200, Math.min(480, width)));
}

export type SidebarController = ReturnType<typeof useSidebar>;

/**
 * サイドバーの開閉（⌘B）と幅（右端をドラッグで変更、ダブルクリックで既定に戻す）。どちらも覚えておく。
 * 表示は Sidebar（サイドバー本体）・SidebarOpenButton（閉じているときの開くボタン）で行う
 */
export function useSidebar() {
  const [open, setOpen] = useSetting(SIDEBAR_OPEN);
  const [storedWidth, setWidth] = useSetting(SIDEBAR_WIDTH);
  const width = clampWidth(storedWidth);
  const [resizing, setResizing] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    const layout = layoutRef.current;
    if (!layout) return;
    let next = width;
    startHorizontalDrag(e, {
      move: (clientX) => {
        next = clampWidth(clientX);
        // ドラッグ中は再描画せず、CSS の変数だけを書き換えて指に追従させる
        layout.style.setProperty("--sidebar-w", `${next}px`);
      },
      end: () => {
        setResizing(false);
        setWidth(next);
      },
    });
    setResizing(true);
  };

  return {
    open,
    toggle: () => setOpen(!open),
    startResize,
    resetWidth: () => setWidth(SIDEBAR_WIDTH.initial),
    /** サイドバーと画面全体を並べる要素に渡す */
    layout: {
      ref: layoutRef,
      className: cx("layout", !open && "sidebar-collapsed", resizing && "resizing-sidebar"),
      style: { "--sidebar-w": `${width}px` } as CSSProperties,
    },
  };
}
