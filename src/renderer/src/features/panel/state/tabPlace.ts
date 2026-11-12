import { isTabVisible } from "@/features/panel/layout/paneTree";
import type { PanelState } from "./panelState";

/** 欄の状態の一覧（panelStore の allPanels）と、画面に出ている欄か（isPanelMounted） */
interface PanelsView {
  panels: Iterable<readonly [string, PanelState]>;
  mounted: (key: string) => boolean;
}

/** タブのある欄（画面に出ている欄だけ。ほかのプロジェクトの欄などは描いていないので数えない。なければ null） */
export function panelOfTab({ panels, mounted }: PanelsView, tabKey: string): string | null {
  for (const [key, state] of panels) if (mounted(key) && state.tabs.some((t) => t.key === tabKey)) return key;
  return null;
}

/** 利用者がそのタブを見ているか（画面に出ている欄が開いていて、どれかのペインで表示中） */
export function isTabShown(view: PanelsView, tabKey: string): boolean {
  const key = panelOfTab(view, tabKey);
  if (key === null) return false;
  for (const [k, state] of view.panels) if (k === key) return state.open && isTabVisible(state.layout, tabKey);
  return false;
}
