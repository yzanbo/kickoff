// ブラウザのタブを、ウィンドウをまたいでドラッグで移す（Chrome と同じ。利用者の依頼）: 別ウィンドウのタブを右サイドバーのタブの列に落とすと戻り、
// 右サイドバーのタブをブラウザの別ウィンドウのタブの列に落とすとそこへ移る。webview はウィンドウをまたげないので、移した先でいまのページを開き直す。
// 落とした側がタブを開き、元の欄（ほかのウィンドウなら知らせ tabMovedOut で）は後始末なしで閉じる
import { useEffect } from "react";
import { postWindowMessage, subscribeWindowMessages } from "@/app/windowBus";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelStateOf } from "@/features/panel/state/panelStore";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";

/** ウィンドウをまたいで渡すブラウザのタブの dataTransfer の型（同じアプリのウィンドウの間なら、独自の型も渡る） */
export const BROWSER_TAB_MIME = "application/x-kickoff-browser-tab";

/** 渡すもの（どの欄のどのタブか・いまのページ） */
export interface MovingBrowserTab {
  panel: string;
  key: string;
  url: string;
  title: string;
}

type BrowserTab = Extract<PanelTab, { kind: "browser" }>;

/** ドラッグを始めたブラウザのタブを、ほかのウィンドウでも受け取れるよう dataTransfer に入れる */
export function writeMovingBrowserTab(data: DataTransfer, panel: string, tab: BrowserTab): void {
  const moving: MovingBrowserTab = { panel, key: tab.key, url: tab.current ?? tab.url, title: tab.title };
  data.setData(BROWSER_TAB_MIME, JSON.stringify(moving));
}

/** dataTransfer の中身を読む（形が合わなければ null） */
export function parseMovingBrowserTab(raw: string): MovingBrowserTab | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { panel, key, url, title } = v as Record<string, unknown>;
    return typeof panel === "string" && typeof key === "string" && typeof url === "string" && typeof title === "string" ? { panel, key, url, title } : null;
  } catch {
    return null;
  }
}

/**
 * 落とされたブラウザのタブをこの欄に開き、元の欄から閉じる（このウィンドウの欄ならここで、ほかのウィンドウなら知らせて）。開いたタブのキーを返す
 */
export function takeMovingBrowserTab(panel: string, moving: MovingBrowserTab): string {
  const actions = panelActions(panel);
  actions.openPanelTab({ kind: "browser", key: moving.key, url: moving.url, title: moving.title });
  if (panelStateOf(moving.panel).tabs.some((t) => t.key === moving.key) && moving.panel !== panel) panelActions(moving.panel).closeTab(moving.key, { dismiss: false, keep: true });
  else postWindowMessage({ type: "tabMovedOut", panel: moving.panel, key: moving.key });
  return moving.key;
}

/** ほかのウィンドウへドラッグで移したタブを、この欄から閉じる（後始末はしない） */
export function useMovedOutTabs(panel: string): void {
  useEffect(
    () =>
      subscribeWindowMessages((m) => {
        if (m.type === "tabMovedOut" && m.panel === panel) panelActions(panel).closeTab(m.key, { dismiss: false, keep: true });
      }),
    [panel],
  );
}
