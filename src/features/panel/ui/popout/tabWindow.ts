// タブの列のある別ウィンドウ（ブラウザ・チャット）の殻（Chrome のウィンドウと同じく、タブの列を持ち、ほかのタブを足せる）。
// 右サイドバーのブラウザのタブ・チャットのパネルのチャット（いちばん上の親）のタブを右クリック・ウィンドウの外へのドラッグで移すと開き、移したタブ 1 つから始まる。
// タブはこのウィンドウの欄（ブラウザ = window:<…>・チャット = cwin:<…>。欄 win / cwin）に持ち、ウィンドウの外へドラッグしたタブはさらに別のウィンドウへ、
// 元の欄・ほかのウィンドウのタブの列に落とせばそこへ移る（features/panel/layout/tabTransfer.ts）。
// 最後のタブを閉じた・移したら、ウィンドウごと閉じる。読み込み直しても同じタブを開き直す（sessionStorage はウィンドウごと）
import { closeSelf, closeWhenDocked, popoutKey, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/panel/ui/storage";
import type { TransferredTab } from "@/features/panel/ui/kind";
import { loadTransferredTab } from "@/features/panel/ui/layout/tabTransfer";
import { openTab, setPanelOpen, showTab } from "@/features/panel/ui/state/actions";
import { kindOf, panelStateOf, setPanelOwnership, subscribePanels } from "@/features/panel/ui/state/panelStore";
import { panelKey, windowScope } from "@/features/panel/ui/surface";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";

/** タブの列のある別ウィンドウの行き先（ブラウザ・チャット） */
export type TabWindowRoute = Extract<PopoutRoute, { kind: "browser" | "chats" }>;

/** タブの列のある別ウィンドウの欄（ブラウザ = win・チャット = cwin）と、移したタブを行き先から作る関数（持ち主の機能が渡す） */
export interface TabWindowSpec {
  surface: "win" | "cwin";
  first(route: TabWindowRoute): PanelTab;
}

/** このウィンドウの欄（始めたら覚える。開発時の StrictMode で 2 回呼ばれても、タブを重ねて開かない） */
let started: string | null = null;

/** 移したタブ（行き先）から、このウィンドウの欄の名前 */
const tabWindowPanel = (route: TabWindowRoute, surface: TabWindowSpec["surface"]): string => panelKey(surface, windowScope(route.projectId, route.key));

/** 欄のいまのタブを、覚える形で（移せる種類の transfer。ブラウザは表示しているページ） */
const currentTabs = (panel: string): TransferredTab[] =>
  panelStateOf(panel).tabs.flatMap((t) => {
    const transfer = kindOf(t).transfer;
    return transfer ? [transfer.save(t)] : [];
  });

/**
 * ウィンドウを始める: 移したタブ（読み込み直したときは覚えたタブ）を欄に開き、欄が変わるたびにタブを覚え直す。
 * タブがなくなったらウィンドウを閉じる。下書きの保存では、このウィンドウの欄だけを持つ（メインのウィンドウの下書きを古い写しで上書きしない）
 */
export function startTabWindow(route: TabWindowRoute, { surface, first }: TabWindowSpec): void {
  const panel = tabWindowPanel(route, surface);
  if (started === panel) return;
  started = panel;
  setPanelOwnership((key) => key === panel);
  const saved = readSetting(storage.settings.popoutWindowTabs).flatMap((t) => loadTransferredTab(t) ?? []);
  const tabs = saved.length > 0 ? saved : [first(route)];
  for (const t of tabs) openTab(panel, t);
  showTab(panel, tabs[0].key);
  setPanelOpen(panel, true);
  let had = true;
  subscribePanels(() => {
    const now = currentTabs(panel);
    writeSetting(storage.settings.popoutWindowTabs, now);
    if (had && now.length === 0) closeSelf();
    had = now.length > 0;
  });
}

/**
 * 「右サイドバーに戻す」「チャットのパネルに戻す」: このウィンドウのタブをすべてメインのウィンドウで開き直し（ブラウザはいまのページで。行き先は種類の popout）、
 * 開き直し終えた知らせを待ってから、このウィンドウを閉じる（戻す先はメインのウィンドウの別ウィンドウの種類の dock）
 */
export function returnTabWindow(route: TabWindowRoute, surface: TabWindowSpec["surface"]): void {
  const routes = panelStateOf(tabWindowPanel(route, surface)).tabs.flatMap((t) => kindOf(t).popout?.(t, route.panel)?.route ?? []);
  const last = routes.at(-1);
  if (!last) return closeSelf();
  closeWhenDocked(popoutKey(last));
  for (const r of routes) postToMainWindow("dockPopout", { route: r });
}
