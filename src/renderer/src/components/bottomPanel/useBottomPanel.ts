import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useStoredNumber } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import type { TerminalTarget } from "../sidePanel/useSidePanel";

/** 下のパネルのターミナルのタブ（key は裏のシェルのキーにも使う） */
export interface BottomTab extends TerminalTarget {
  key: string;
}

const HEIGHT_KEY = "kickoff:bottom-panel-height";
const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
/** 上の画面に残す高さ */
const KEEP_ABOVE = 120;

export type BottomPanelController = ReturnType<typeof useBottomPanel>;

/**
 * 画面の下のパネル（VS Code と同じく、どの画面でも ⌃` か ⌘J で開閉するターミナル）の状態と操作。
 * targets: 新しいターミナルを開く場所（いまのプロジェクト。全プロジェクトの画面ではすべてのプロジェクト）。
 * 表示は BottomPanel。シェルはメインプロセスで動き続けるので、閉じてもタブは残す
 */
export function useBottomPanel(targets: TerminalTarget[]) {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<BottomTab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [height, setHeight] = useStoredNumber(HEIGHT_KEY, DEFAULT_HEIGHT);
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const available = Boolean(window.kickoff?.terminal);

  const openTerminal = (target: TerminalTarget) => {
    const key = `bottom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    setTabs((prev) => [...prev, { key, ...target }]);
    setActive(key);
    setOpen(true);
  };

  /** 開閉。開くときにタブがなく、開く場所が 1 つ（プロジェクトの画面）なら、そこでターミナルを始める */
  const toggle = () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (tabs.length === 0 && targets.length === 1) openTerminal(targets[0]);
  };

  /** タブを閉じる（シェルも止める）。最後のタブならパネルも閉じる */
  const closeTab = (key: string) => {
    void window.kickoff?.terminal.close(key);
    // 続けて閉じても取りこぼさないよう、いまのタブの一覧から決める
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.key === key);
      const next = prev.filter((t) => t.key !== key);
      setActive((a) => (a === key ? (next[Math.min(index, next.length - 1)]?.key ?? null) : a));
      if (next.length === 0) {
        setOpen(false);
        setMaximized(false);
      }
      return next;
    });
  };

  /** 上の端をドラッグして高さを変える（ダブルクリックで元の高さ） */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    const column = panel?.parentElement;
    if (!panel || !column) return;
    const bottom = column.getBoundingClientRect().bottom;
    const max = column.clientHeight - KEEP_ABOVE;
    let next = height;
    if (maximized) setMaximized(false);
    setResizing(true);
    startVerticalDrag(e, {
      move: (clientY) => {
        next = Math.round(Math.max(MIN_HEIGHT, Math.min(max, bottom - clientY)));
        panel.style.height = `${next}px`;
      },
      end: () => {
        setResizing(false);
        setHeight(next);
      },
    });
  };

  // ⌃`（VS Code と同じ）か ⌘J で開閉。ターミナルの中で押しても効くよう、ほかより先に受け取る
  useWindowEvent(
    "keydown",
    (e) => {
      const ctrlBackquote = e.ctrlKey && !e.metaKey && e.code === "Backquote";
      const cmdJ = e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "j";
      if (!ctrlBackquote && !cmdJ) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    available,
    true,
  );

  return {
    available,
    open,
    tabs,
    active,
    maximized,
    targets,
    toggle,
    close: () => setOpen(false),
    openTerminal,
    closeTab,
    showTab: setActive,
    toggleMaximized: () => setMaximized((m) => !m),
    startResize,
    resetHeight: () => setHeight(DEFAULT_HEIGHT),
    /** パネルの要素に渡す */
    panelProps: {
      ref: panelRef,
      style: maximized ? undefined : { height: `${height}px` },
    },
    resizing,
  };
}
