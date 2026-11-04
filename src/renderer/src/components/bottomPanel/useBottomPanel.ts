import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { ProjectSummary } from "../../../../core/types";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useStoredNumber } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { BOTTOM_PANEL_HEIGHT_KEY } from "../../storageKeys";
import { useSidePanel, type TerminalTarget } from "../sidePanel/useSidePanel";

/** どの画面のパネルか（プロジェクトの ID。全プロジェクトの画面は "all"） */
type BottomScope = number | "all";

const DEFAULT_HEIGHT = 198;
const MIN_HEIGHT = 120;
/** 上の画面に残す高さ */
const KEEP_ABOVE = 120;

export type BottomPanelController = ReturnType<typeof useBottomPanel>;

/**
 * フッター（画面の下のパネル。VS Code と同じく、どの画面でも ⌃` か ⌘J で開閉する）の状態と操作。
 * 中身は右のパネル・右端のチャット欄と同じタブ（useSidePanel の欄 "bottom"）で、初めはターミナルとブラウザを出す
 * （表示するタブ・タブのまとめ方はフッターだけで覚える）。タブ・開いているかはプロジェクトごと（全プロジェクトの画面は別）。
 * タブはほかの欄と同じく上下・左右のペインに分けられる（フッターにピントがあるときの ⌘\ で右に分ける）。
 * Esc では閉じない（ターミナルの中で使うため）。シェルはメインプロセスで動き続けるので、閉じても・ほかのプロジェクトに移っても残る
 */
export function useBottomPanel(scope: BottomScope, targets: TerminalTarget[], projects: ProjectSummary[]) {
  const panel = useSidePanel({
    memoryKey: `bottom:${scope}`,
    scope,
    surface: "bottom",
    holdEsc: true,
    // 全プロジェクトの画面では、新しいチャットのプロジェクトを選べるようにする
    projects: scope === "all" ? projects : undefined,
  });
  const [maximized, setMaximized] = useState(false);
  const [height, setHeight] = useStoredNumber(BOTTOM_PANEL_HEIGHT_KEY, DEFAULT_HEIGHT);
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const available = Boolean(window.kickoff);
  const open = panel.panelOpen;

  /** 開閉。開くときに見せているタブがなく、ターミナルを出す欄で開く場所が 1 つ（プロジェクトの画面）なら、そこでターミナルを始める */
  const toggle = () => {
    if (open) return panel.close();
    const empty = !panel.tabs.some((t) => panel.isKindShown(t.key));
    if (empty && panel.kinds.has("terminal") && targets.length === 1 && window.kickoff?.terminal) return panel.openTerminal(targets[0]);
    panel.toggle();
  };

  /** 上の端をドラッグして高さを変える（ダブルクリックで元の高さ） */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = panelRef.current;
    const column = el?.parentElement;
    if (!el || !column) return;
    const bottom = column.getBoundingClientRect().bottom;
    const max = column.clientHeight - KEEP_ABOVE;
    let next = height;
    if (maximized) setMaximized(false);
    setResizing(true);
    startVerticalDrag(e, {
      move: (clientY) => {
        next = Math.round(Math.max(MIN_HEIGHT, Math.min(max, bottom - clientY)));
        el.style.setProperty("--bottom-h", `${next}px`);
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
    maximized,
    targets,
    panel,
    toggle,
    close: () => {
      panel.close();
      setMaximized(false);
    },
    toggleMaximized: () => setMaximized((m) => !m),
    startResize,
    resetHeight: () => setHeight(DEFAULT_HEIGHT),
    /** パネルの要素に渡す */
    // 開閉は高さの動きで見せる（中身は開いたときの高さのまま。ターミナルが動いている間に何度も大きさを変えないように）
    panelProps: {
      ref: panelRef,
      style: { "--bottom-h": `${height}px` } as CSSProperties,
    },
    resizing,
  };
}
