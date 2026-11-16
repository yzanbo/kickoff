// ブラウザの別ウィンドウの殻（Chrome のウィンドウと同じく、タブの列を持ち、中でもタブを足せる。利用者の依頼）。
// 右サイドバーのブラウザのタブを右クリック・ウィンドウの外へのドラッグで移すと開き、移したタブ 1 つから始まる。
// タブはこのウィンドウの欄（window:<…>。SURFACES.window）に持ち、ウィンドウの外へドラッグしたタブはさらに別のウィンドウへ移る。
// 最後のタブを閉じた・移したら、ウィンドウごと閉じる。読み込み直しても同じタブを開き直す（sessionStorage はウィンドウごと）
import { popoutKey, type PopoutRoute } from "@/app/popout";
import { postToMainWindow, subscribeWindowMessages } from "@/app/windowBus";
import { readSetting, writeSetting } from "@/lib/storage";
import { POPOUT_BROWSER_TABS, type PopoutBrowserTab } from "@/lib/storageKeys";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelStateOf, setPanelOwnership, subscribePanels } from "@/features/panel/state/panelStore";
import { panelKey, windowScope } from "@/features/panel/surfaces";

type BrowserRoute = Extract<PopoutRoute, { kind: "browser" }>;

/** 戻し終えた知らせ（docked）を待つ上限（メインのウィンドウが応えなくても閉じる） */
const RETURN_WAIT_MS = 3000;

/** このウィンドウの欄（始めたら覚える。開発時の StrictMode で 2 回呼ばれても、タブを重ねて開かない） */
let started: string | null = null;

/** このウィンドウを閉じる */
const closeSelf = () => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());

/** 移したタブ（行き先）から、このウィンドウの欄の名前 */
export const browserWindowPanel = (route: BrowserRoute): string => panelKey("window", windowScope(route.projectId, route.key));

/** 欄のいまのブラウザのタブ（いま表示しているページで） */
function currentTabs(panel: string): PopoutBrowserTab[] {
  // 空のページ（新しいタブ）は開いたときの URL のまま（about:blank を覚えると、開き直したタブの名前が「about:blank」になる）
  return panelStateOf(panel).tabs.flatMap((t) => (t.kind === "browser" ? [{ key: t.key, url: t.current && t.current !== "about:blank" ? t.current : t.url, title: t.title }] : []));
}

/**
 * ウィンドウを始める: 移したタブ（読み込み直したときは覚えたタブ）を欄に開き、欄が変わるたびにタブを覚え直す。
 * タブがなくなったらウィンドウを閉じる。下書きの保存では、このウィンドウの欄だけを持つ（メインのウィンドウの下書きを古い写しで上書きしない）
 */
export function startBrowserWindow(route: BrowserRoute): void {
  const panel = browserWindowPanel(route);
  if (started === panel) return;
  started = panel;
  setPanelOwnership((key) => key === panel);
  const saved = readSetting(POPOUT_BROWSER_TABS);
  const tabs = saved.length > 0 ? saved : [{ key: route.key, url: route.url, title: route.title }];
  const actions = panelActions(panel);
  for (const t of tabs) actions.openPanelTab({ kind: "browser", key: t.key, url: t.url, title: t.title });
  actions.showTab(tabs[0].key);
  actions.setOpen(true);
  let had = true;
  subscribePanels(() => {
    const now = currentTabs(panel);
    writeSetting(POPOUT_BROWSER_TABS, now);
    if (had && now.length === 0) closeSelf();
    had = now.length > 0;
  });
}

/**
 * 「右サイドバーに戻す」: このウィンドウのタブをすべて、メインのウィンドウの右サイドバーにいまのページで開き直し、
 * 開き直し終えた知らせを待ってから、このウィンドウを閉じる（戻す先はメインのウィンドウの dockPopout）
 */
export function returnBrowserWindow(route: BrowserRoute): void {
  const routes = currentTabs(browserWindowPanel(route)).map((t): BrowserRoute => ({ ...route, key: t.key, url: t.url, title: t.title }));
  const last = routes.at(-1);
  if (!last) return closeSelf();
  const key = popoutKey(last);
  const timer = setTimeout(closeSelf, RETURN_WAIT_MS);
  subscribeWindowMessages((m) => {
    if (m.type !== "docked" || m.key !== key) return;
    clearTimeout(timer);
    closeSelf();
  });
  for (const r of routes) postToMainWindow({ type: "dockPopout", route: r });
}
