// タブの列のある別ウィンドウ（ブラウザ・チャット）の殻（Chrome のウィンドウと同じく、タブの列を持ち、ほかのタブを足せる）。
// 右サイドバーのブラウザのタブ・チャットのパネルのチャット（いちばん上の親）のタブを右クリック・ウィンドウの外へのドラッグで移すと開き、移したタブ 1 つから始まる。
// タブはこのウィンドウの欄（ブラウザ = window:<…>・チャット = cwin:<…>。欄 win / cwin）に持ち、ウィンドウの外へドラッグしたタブはさらに別のウィンドウへ、
// 元の欄・ほかのウィンドウのタブの列に落とせばそこへ移る（features/panel/layout/tabTransfer.ts）。
// 最後のタブを閉じた・移したら、ウィンドウごと閉じる。読み込み直しても同じタブを開き直す（sessionStorage はウィンドウごと）
import { popoutKey, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { onWindowMessage, postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/panel/ui/storage";
import type { PopoutWindowTab } from "@/features/panel/ui/popoutWindowTab";
import { openTab, setPanelOpen, showTab } from "@/features/panel/ui/state/actions";
import { panelStateOf, setPanelOwnership, subscribePanels } from "@/features/panel/ui/state/panelStore";
import { panelKey, windowScope } from "@/features/panel/ui/surface";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";

/** タブの列のある別ウィンドウの行き先（ブラウザ・チャット） */
export type TabWindowRoute = Extract<PopoutRoute, { kind: "browser" | "chats" }>;

/** 戻し終えた知らせ（docked）を待つ上限（メインのウィンドウが応えなくても閉じる） */
const RETURN_WAIT_MS = 3000;

/** このウィンドウの欄（始めたら覚える。開発時の StrictMode で 2 回呼ばれても、タブを重ねて開かない） */
let started: string | null = null;

/** このウィンドウを閉じる */
const closeSelf = () => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());

/** 移したタブ（行き先）から、このウィンドウの欄の名前 */
const tabWindowPanel = (route: TabWindowRoute): string => panelKey(route.kind === "browser" ? "win" : "cwin", windowScope(route.projectId, route.key));

/** 移したタブ（行き先）のタブ（送る前の新しいチャットはキーが下書きのキー。中身は composer の下書きの店） */
function firstTab(route: TabWindowRoute): PanelTab {
  if (route.kind === "browser") return { kind: "browser", key: route.key, url: route.url, title: route.title };
  if (route.chatId !== undefined) return { kind: "chat", key: route.key, id: route.chatId, projectId: route.projectId };
  return { kind: "new", key: route.key };
}

/** 覚えたタブを欄のタブに（チャットの中身・名前は開いてから届く） */
function toPanelTab(t: PopoutWindowTab): PanelTab {
  if (t.kind === "browser") return { kind: "browser", key: t.key, url: t.url, title: t.title };
  if (t.kind === "chat") return { kind: "chat", key: t.key, id: t.id, projectId: t.projectId };
  return { kind: "new", key: t.key };
}

/** 欄のいまのタブを、覚える形で（ブラウザは表示しているページ。空のページ（新しいタブ）は開いたときの URL のまま） */
function currentTabs(panel: string): PopoutWindowTab[] {
  return panelStateOf(panel).tabs.flatMap((t): PopoutWindowTab[] => {
    if (t.kind === "browser") return [{ kind: "browser", key: t.key, url: t.current && t.current !== "about:blank" ? t.current : t.url, title: t.title }];
    if (t.kind === "chat") return [{ kind: "chat", key: t.key, id: t.id, projectId: t.projectId }];
    if (t.kind === "new") return [{ kind: "new", key: t.key }];
    return [];
  });
}

/**
 * ウィンドウを始める: 移したタブ（読み込み直したときは覚えたタブ）を欄に開き、欄が変わるたびにタブを覚え直す。
 * タブがなくなったらウィンドウを閉じる。下書きの保存では、このウィンドウの欄だけを持つ（メインのウィンドウの下書きを古い写しで上書きしない）
 */
export function startTabWindow(route: TabWindowRoute): void {
  const panel = tabWindowPanel(route);
  if (started === panel) return;
  started = panel;
  setPanelOwnership((key) => key === panel);
  const saved = readSetting(storage.settings.popoutWindowTabs);
  const tabs = saved.length > 0 ? saved.map(toPanelTab) : [firstTab(route)];
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

/** 覚えたタブを、メインのウィンドウに戻す行き先に（ブラウザは右サイドバー、チャットはチャットのパネル。送る前の新しいチャットはキーだけ。dockPopout） */
function returnRoute(route: TabWindowRoute, t: PopoutWindowTab): PopoutRoute {
  if (t.kind === "browser") return { kind: "browser", panel: route.panel, key: t.key, url: t.url, title: t.title, projectId: route.projectId };
  if (t.kind === "chat") return { kind: "chats", panel: route.panel, key: t.key, chatId: t.id, projectId: t.projectId };
  // 戻す先のプロジェクトは下書きの作成先（dockPopout が下書きの店から引く）
  return { kind: "chats", panel: route.panel, key: t.key, projectId: route.projectId ?? 0 };
}

/**
 * 「右サイドバーに戻す」「チャットのパネルに戻す」: このウィンドウのタブをすべてメインのウィンドウで開き直し（ブラウザはいまのページで）、
 * 開き直し終えた知らせを待ってから、このウィンドウを閉じる（戻す先はメインのウィンドウの dockPopout）
 */
export function returnTabWindow(route: TabWindowRoute): void {
  const routes = currentTabs(tabWindowPanel(route)).map((t) => returnRoute(route, t));
  const last = routes.at(-1);
  if (!last) return closeSelf();
  const key = popoutKey(last);
  const timer = setTimeout(closeSelf, RETURN_WAIT_MS);
  onWindowMessage("docked", (m) => {
    if (m.key !== key) return;
    clearTimeout(timer);
    closeSelf();
  });
  for (const r of routes) postToMainWindow("dockPopout", { route: r });
}
