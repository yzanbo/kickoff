import { canPopout, openPopout } from "@/app/popout";
import type { PanelPageOps, PanelTab } from "@/features/panel/usePanel";
import { panelStateOf } from "@/features/panel/state/panelStore";
import { specOf } from "./tabKinds";

/** 別ウィンドウで開けるタブか（Mac のアプリで、チャットの画面の右の欄のサブエージェント・変更・ファイルなどのタブと、パネルのブラウザ・ターミナルのタブ） */
export const canPopOut = (tab: PanelTab | undefined): boolean => canPopout() && tab !== undefined && specOf(tab).popout !== undefined;

/**
 * タブを別ウィンドウで開き、欄からは閉じる（別ウィンドウへ移す。同じものがもう開いていれば、それを前に出す）。
 * 閉じるときは後始末をしない（ターミナルのシェルは止めず、移した先がつなぎ直す）
 */
export function popOutTab(panel: Pick<PanelPageOps, "key" | "closeTab">, tabKey: string) {
  const tab = panelStateOf(panel.key).tabs.find((t) => t.key === tabKey);
  const target = tab && specOf(tab).popout?.(tab, panel.key);
  if (!target) return;
  openPopout(target.route, target.title);
  panel.closeTab(tabKey, { dismiss: false, keep: true });
}
