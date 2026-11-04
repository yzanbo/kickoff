import { useState, type CSSProperties } from "react";
import { useDragSize } from "@/hooks/useDragSize";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { BOTTOM_PANEL_HEIGHT } from "@/lib/storageKeys";
import { usePanel, type TerminalTarget } from "@/features/panel/usePanel";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";

/** どの画面のパネルか（プロジェクトの ID。全プロジェクトの画面は "all"） */
type BottomScope = number | "all";

const MIN_HEIGHT = 120;
/** 上の画面に残す高さ */
const KEEP_ABOVE = 120;

export type BottomPanelController = ReturnType<typeof useBottomPanel>;

/**
 * フッター（画面の下のパネル。VS Code と同じく、どの画面でも ⌃` か ⌘J で開閉する）の状態と操作。
 * 中身は右のパネル・右端のチャット欄と同じタブ（usePanel の欄 "bottom"）で、初めはターミナルとブラウザを出す
 * （表示するタブ・タブのまとめ方はフッターだけで覚える）。タブ・開いているかはプロジェクトごと（全プロジェクトの画面は別）。
 * タブはほかの欄と同じく上下・左右のペインに分けられる（フッターにピントがあるときの ⌘\ で右に分ける）。
 * Esc では閉じない（ターミナルの中で使うため）。シェルはメインプロセスで動き続けるので、閉じても・ほかのプロジェクトに移っても残る
 */
export function useBottomPanel(scope: BottomScope, targets: TerminalTarget[]) {
  // 全プロジェクトの画面では、新しいチャットのプロジェクトを選べるようにする（全プロジェクトのボードと同じく、しまったものを除き、タグの絞り込みに合うもの）
  const { visible } = useVisibleProjects();
  const panel = usePanel({
    memoryKey: `bottom:${scope}`,
    scope,
    surface: "bottom",
    holdEsc: true,
    projects: scope === "all" ? visible : undefined,
  });
  const [maximized, setMaximized] = useState(false);
  // 上の端をドラッグして高さを変える（いま見えている高さから。最大化していればやめる。ダブルクリックで元の高さ）
  const resize = useDragSize({
    setting: BOTTOM_PANEL_HEIGHT,
    axis: "y",
    edge: "start",
    min: MIN_HEIGHT,
    keep: KEEP_ABOVE,
    write: "--bottom-h",
    onStart: () => setMaximized(false),
  });
  const available = Boolean(window.kickoff);
  const open = panel.panelOpen;

  /** 開閉。開くときに見せているタブがなく、ターミナルを出す欄で開く場所が 1 つ（プロジェクトの画面）なら、そこでターミナルを始める */
  const toggle = () => {
    if (open) return panel.close();
    const empty = !panel.tabs.some((t) => panel.isKindShown(t.key));
    if (empty && panel.kinds.has("terminal") && targets.length === 1 && window.kickoff?.terminal) return panel.openTerminal(targets[0]);
    panel.toggle();
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
    /** 上の端のつまみに渡す */
    resizeHandle: resize.handle,
    /** パネルの要素に渡す */
    // 開閉は高さの動きで見せる（中身は開いたときの高さのまま。ターミナルが動いている間に何度も大きさを変えないように）
    panelProps: {
      ref: resize.paneRef,
      style: { "--bottom-h": `${resize.size}px` } as CSSProperties,
    },
    resizing: resize.resizing,
  };
}
