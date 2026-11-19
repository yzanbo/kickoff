import { canPopout, openPopout } from "@/foundation/ui/navigation/popout";
import type { PanelPageOps, PanelTab } from "@/features/panel/ui/usePanel";
import { panelStateOf } from "@/features/panel/ui/state/panelStore";
import { specOf } from "./tabKinds";
import { handOffTab } from "./tabHandoff";

/** 別ウィンドウで開けるタブか（Mac のアプリで、チャットの画面の右の欄のサブエージェント・変更・ファイルなどのタブと、パネルのブラウザ・ターミナルのタブ） */
export const canPopOut = (tab: PanelTab | undefined): boolean => canPopout() && tab !== undefined && specOf(tab).popout !== undefined;

/**
 * タブを別ウィンドウで開き、欄からは閉じる（別ウィンドウへ移す。同じものがもう開いていれば、それを前に出す）。
 * 閉じるときは後始末をしない（ターミナルのシェルは止めず、移した先がつなぎ直す）。at はウィンドウを置く画面の位置（タブをウィンドウの外へドラッグして離した所）。
 * 別ウィンドウで開けないタブ（チャットなど）・ブラウザで開いた画面では何もしない
 */
export function popOutTab(panel: Pick<PanelPageOps, "key" | "closeTab">, tabKey: string, at: { x: number; y: number } | null = null) {
  const tab = panelStateOf(panel.key).tabs.find((t) => t.key === tabKey);
  const target = canPopout() && tab ? specOf(tab).popout?.(tab, panel.key) : undefined;
  if (!target) return;
  // 送る前の新しいチャットは、書きかけの文・添付ごと渡す（URL には入らないので）
  if (tab?.kind === "new") handOffTab(tab);
  openPopout(target.route, target.title, at);
  // チャットのタブは、サイドバーとの連動で足し直されないよう「表示だけ消した」ことにする（チャットのパネルに戻せば、また出る）
  panel.closeTab(tabKey, { dismiss: tab?.kind === "chat", keep: true });
}
