import { canPopout, openPopout } from "@/app/popout";
import type { PanelController, PanelTab } from "@/features/panel/usePanel";
import { specOf } from "./tabKinds";

/** 別ウィンドウで開けるタブか（Mac のアプリで、チャットの画面の右の欄のサブエージェント・変更・ファイルのタブ） */
export const canPopOut = (tab: PanelTab | undefined): boolean => canPopout() && tab !== undefined && specOf(tab).popout !== undefined;

/** タブを別ウィンドウで開き、右の欄からは閉じる（別ウィンドウへ移す。同じものがもう開いていれば、それを前に出す） */
export function popOutTab(panel: PanelController, tabKey: string) {
  const tab = panel.tabs.find((t) => t.key === tabKey);
  const target = tab && specOf(tab).popout?.(tab);
  if (!target) return;
  openPopout(target.route, target.title);
  panel.closeTab(tabKey, { dismiss: false });
}
