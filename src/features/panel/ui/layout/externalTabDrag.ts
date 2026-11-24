import { createCell, useCell } from "@/foundation/ui/store";
import type { PanelTab } from "@/features/panel/ui/panelTypes";

/**
 * パネルの外からタブにして落とすもの（ファイルタブの木の行など）のドラッグ。落とす先の欄（覚える名前）と、落としたら開くタブを持つ。
 * パネルのタブのドラッグ（useTabDrag）と同じく、タブの列に落とすとその位置、中身の端に落とすとその側に分けて開く
 */
export const EXTERNAL_TAB_MIME = "application/x-kickoff-panel-external-tab";

const current = createCell<{ panelKey: string; tab: PanelTab } | null>(null);

/** ドラッグを始めた（dragstart の次の回に呼ぶ。dragstart の中で覆いを出すとドラッグが取り消されることがある） */
export const beginExternalTabDrag = (panelKey: string, tab: PanelTab) => current.set({ panelKey, tab });

/** ドラッグを終えた（dragend・落としたとき） */
export const endExternalTabDrag = () => current.set(null);

/** この欄に落とせる、外からドラッグしているタブ（なければ null） */
export const useExternalTabDrag = (panelKey: string): PanelTab | null => useCell(current, (c) => (c?.panelKey === panelKey ? c.tab : null));
