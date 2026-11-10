import { useSyncExternalStore } from "react";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";

/**
 * パネルの外からタブにして落とすもの（ファイルタブの木の行など）のドラッグ。落とす先の欄（覚える名前）と、落としたら開くタブを持つ。
 * パネルのタブのドラッグ（useTabDrag）と同じく、タブの列に落とすとその位置、中身の端に落とすとその側に分けて開く
 */
export const EXTERNAL_TAB_MIME = "application/x-kickoff-panel-external-tab";

let current: { panelKey: string; tab: PanelTab } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** ドラッグを始めた（dragstart の次の回に呼ぶ。dragstart の中で覆いを出すとドラッグが取り消されることがある） */
export function beginExternalTabDrag(panelKey: string, tab: PanelTab) {
  current = { panelKey, tab };
  notify();
}

/** ドラッグを終えた（dragend・落としたとき） */
export function endExternalTabDrag() {
  if (!current) return;
  current = null;
  notify();
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/** この欄に落とせる、外からドラッグしているタブ（なければ null） */
export function useExternalTabDrag(panelKey: string): PanelTab | null {
  return useSyncExternalStore(subscribe, () => (current?.panelKey === panelKey ? current.tab : null));
}
