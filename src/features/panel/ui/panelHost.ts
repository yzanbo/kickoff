import { createContext, useContext, type ComponentType } from "react";
import type { PanelFrame } from "./PanelTools";
import type { PanelController } from "./usePanel";

/** パネルを描く部品（Panel）の形 */
export type PanelComponent = ComponentType<{ panel: PanelController; frame?: PanelFrame }>;

/**
 * パネルの中身から、パネルを入れ子にして描くための口（チャットのタブの中の右の欄＝サブエージェントの欄）。
 * Panel が自分の中身に自分を渡す。Panel → タブの中身（PanelTabPage）→ チャットの画面 → Panel と import すると輪になるので、
 * チャットの画面は Panel を import せず、ここから受け取る。パネルの外（null）では入れ子にしない
 */
export const PanelHostContext = createContext<PanelComponent | null>(null);

export const usePanelHost = (): PanelComponent | null => useContext(PanelHostContext);

/**
 * ピントのある要素を、いちばん内側で含んでいる欄の覚える名前（パネルの根の data-panel-key）。どの欄にもなければ undefined。
 * 入れ子の欄（チャットの中の右の欄）でキーを押したとき、外側の欄（ボードの右のパネル）が同じキーで動かないようにするため
 */
export function focusedPanelKey(): string | undefined {
  const el = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>("[data-panel-key]") : null;
  return el?.dataset.panelKey;
}

/** ピントが、この欄の中にある入れ子の別の欄にあるか（そのときは、この欄はキーを受け取らない） */
export function focusInNestedPanel(key: string): boolean {
  const inner = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>("[data-panel-key]") : null;
  if (!inner || inner.dataset.panelKey === key) return false;
  return inner.parentElement?.closest(`[data-panel-key="${CSS.escape(key)}"]`) != null;
}
