// 欄の種類をまたいでタブを閉じる（子チャットを親から外したときに、どのチャットの右の欄からもそのタブを閉じるなど）
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { isTabVisible } from "@/features/panel/ui/layout/paneTree";
import type { PanelSurface } from "@/features/panel/ui/surface";
import type { TabBase } from "@/features/panel/ui/kind";
import { allPanels, dispatchPanel, kindOf } from "./panelStore";

/**
 * タブを閉じてよいか（種類の confirmClose。保存していない書きかけのあるファイル・ノートは保存するかを聞く。ほかの種類はそのまま true）。
 * タブの ×・右クリックの「タブを閉じる」・ペインを閉じるで同じに聞く（どれかで書きかけを黙って捨てない）
 */
export const confirmTabClose = (panel: string, tab: TabBase): Promise<boolean> => kindOf(tab).confirmClose?.(tab, panel) ?? Promise.resolve(true);

/** 何枚かのタブを閉じてよいか（順に聞き、どれかでやめたら false） */
export async function confirmTabsClose(panel: string, tabs: readonly TabBase[]): Promise<boolean> {
  for (const tab of tabs) if (!(await confirmTabClose(panel, tab))) return false;
  return true;
}

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
