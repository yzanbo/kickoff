import { useRef, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_OPEN, SIDEBAR_WIDTH } from "@/lib/storageKeys";

/** サイドバーの幅は 200〜480px（狭くしすぎ・広げすぎを防ぐ） */
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export type SidebarController = ReturnType<typeof useSidebar>;

/**
 * サイドバーの開閉（⌘B）と幅（右端をドラッグで変更、ダブルクリックで既定に戻す）。どちらも覚えておく。
 * 表示は Sidebar（サイドバー本体）・SidebarOpenButton（閉じているときの開くボタン）で行う
 */
export function useSidebar() {
  const [open, setOpen] = useSetting(SIDEBAR_OPEN);
  const layoutRef = useRef<HTMLDivElement>(null);
  // ドラッグ中は再描画せず、画面全体を並べる要素の CSS の変数だけを書き換えて指に追従させる
  const resize = useDragSize({ setting: SIDEBAR_WIDTH, min: MIN_WIDTH, max: MAX_WIDTH, write: "--sidebar-w", target: () => layoutRef.current });
  const width = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resize.size)));

  return {
    open,
    toggle: () => setOpen(!open),
    /** サイドバー本体に付ける（ドラッグを始めたときの幅を測る） */
    paneRef: resize.paneRef,
    /** 右端のつまみに渡す */
    resizeHandle: resize.handle,
    /** サイドバーと画面全体を並べる要素に渡す */
    layout: {
      ref: layoutRef,
      className: cx("layout", !open && "sidebar-collapsed", resize.resizing && "resizing-sidebar"),
      style: { "--sidebar-w": `${width}px` } as CSSProperties,
    },
  };
}
