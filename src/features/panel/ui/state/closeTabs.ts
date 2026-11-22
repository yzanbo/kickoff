// 欄の種類をまたいでタブを閉じる（子チャットを親から外したときに、どのチャットの右の欄からもそのタブを閉じるなど）
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { isTabVisible } from "@/features/panel/ui/layout/paneTree";
import type { PanelSurface } from "@/features/panel/ui/surfaces";
import { allPanels, dispatchPanel } from "./panelStore";

/** その種類の欄（surface。どの範囲のものも）から、match に合うタブを閉じる。wasVisible: 閉じたタブのどれかが表に出ていたか */
export function closeTabsWhere(surface: PanelSurface, match: (tab: PanelTab) => boolean): { wasVisible: boolean } {
  let wasVisible = false;
  for (const [key, state] of [...allPanels()]) {
    if (!key.startsWith(`${surface}:`)) continue;
    const tabs = state.tabs.filter(match);
    if (tabs.length === 0) continue;
    if (tabs.some((t) => isTabVisible(state.layout, t.key))) wasVisible = true;
    dispatchPanel(key, { type: "close", keys: tabs.map((t) => t.key), dismiss: false });
  }
  return { wasVisible };
}
