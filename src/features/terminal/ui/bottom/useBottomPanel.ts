import { useEffect, useState, type CSSProperties } from "react";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { commandHandler, useCommandHandler } from "@/foundation/ui/commands";
import { panelKey, panelSettings, terminalTab, togglePanel, type PanelScope, type TerminalTarget, usePanelOpen } from "@/features/panel/ui";

const MIN_HEIGHT = 120;
/** 上の画面に残す高さ */
const KEEP_ABOVE = 120;

export type BottomPanelController = ReturnType<typeof useBottomPanel>;

/** ⌃` / ⌘J のコマンド（terminal.toggleBottom）が呼ぶ開閉（App の useBottomPanel が置く。ターミナルの使えるアプリでだけ） */
export const bottomToggles = commandHandler();

/**
 * フッター（画面の下のパネル。VS Code と同じく、どの画面でも ⌃` か ⌘J で開閉する）の殻: 開閉・高さ・最大化・ショートカット。App が持つ。
 * 中身は右のパネル・右端のチャット欄と同じタブ（BottomPanel の中の usePanel の欄 "bottom"）で、ターミナルだけを出す。
 * タブ・開いているかはプロジェクトごと（全プロジェクトの画面は別）。
 * タブはほかの欄と同じく上下・左右のペインに分けられる（フッターにピントがあるときの ⌘\ で右に分ける）。
 * Esc では閉じない（ターミナルの中で使うため）。シェルはメインプロセスで動き続けるので、閉じても・ほかのプロジェクトに移っても残る
 */
export function useBottomPanel(scope: PanelScope, targets: TerminalTarget[]) {
  const key = panelKey("bottom", scope);
  const open = usePanelOpen(key);
  const [maximized, setMaximized] = useState(false);
  // 上の端をドラッグして高さを変える（いま見えている高さから。最大化していればやめる。ダブルクリックで元の高さ）
  const resize = useDragSize({
    setting: panelSettings.bottomHeight,
    axis: "y",
    edge: "start",
    min: MIN_HEIGHT,
    keep: KEEP_ABOVE,
    write: "--bottom-h",
    onStart: () => setMaximized(false),
  });
  const available = Boolean(window.kickoff);
  // 閉じたら最大化をやめる（閉じるボタン・最後のタブを閉じた・⌃` のどれで閉じても、次は元の高さで開く）
  useEffect(() => {
    if (!open) setMaximized(false);
  }, [open]);

  /** 開閉。開くときにタブがなく、開く場所が 1 つ（プロジェクトの画面）なら、そこでターミナルを始める */
  const toggle = () => togglePanel(key, { emptyTab: targets.length === 1 && window.kickoff?.terminal ? terminalTab(targets[0]) : undefined });

  // ⌃`（VS Code と同じ）か ⌘J で開閉（コマンドの表は ../contributes.ts。ターミナルの中で押しても効くよう、ほかより先に受け取る）
  useCommandHandler(bottomToggles, toggle, available);

  return {
    available,
    scope,
    open,
    maximized,
    targets,
    /** タブの列・タブがないときに開けるターミナルの場所（ターミナルの使える Mac のアプリでだけ） */
    terminals: window.kickoff?.terminal ? targets : [],
    toggle,
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
