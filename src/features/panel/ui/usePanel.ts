import { useMemo } from "react";
import { isTabVisible } from "@/features/panel/ui/layout/paneTree";
import * as ops from "@/features/panel/ui/state/actions";
import { isLinkedTab, type TabPatch } from "@/features/panel/ui/state/panelState";
import { surfaceOf, useMountedPanel, usePanelState } from "@/features/panel/ui/state/panelStore";
import { panelKey, type PanelScope, type PanelSurface, type SurfaceSpec } from "./surface";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { browserTab, chatKey, chatTab } from "@/features/panel/ui/tabs/tabData";

export type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";

export type PanelController = ReturnType<typeof usePanel>;

/**
 * タブの中身（TabPageFrame）に渡す操作。欄の状態（タブ・配置）が変わっても同じ物なので、memo したタブの中身を描き直させない
 * （ほかのタブのチャットが変わってパネルの店が変わっても、そのタブだけが描き直る）
 */
export type PanelPageOps = ReturnType<typeof panelOps> & {
  /** 新しいチャットを送ったら、そのタブをできたチャットのタブに置き換える（同じペインの同じ位置のまま） */
  replaceWithChat: (tabKey: string, chat: { id: number; project_id: number; title?: string }) => void;
};

/** 欄の操作を住所に結びつけたもの（中身は state/actions.ts の関数） */
function panelOps(key: string) {
  return {
    key,
    /** ブラウザの新しいタブを開き、そのキーを返す（url がなければ空のページで、アドレス欄に入力して開く） */
    openBrowser: (url = "") => {
      const tab = browserTab(url);
      ops.openTab(key, tab);
      return tab.key;
    },
    /** ブラウザのタブを表に出さずに足す（リンク・画像を裏で開いたとき。見ているタブ・欄の開閉は変えない） */
    addBrowserBehind: (url: string) => ops.addTabBehind(key, browserTab(url)),
    showTab: (tabKey: string) => ops.showTab(key, tabKey),
    patchTab: (tabKey: string, patch: TabPatch) => ops.patchTab(key, tabKey, patch),
    replaceTab: (tabKey: string, tab: PanelTab) => ops.replaceTab(key, tabKey, tab),
    closeTab: (tabKey: string, opts?: { dismiss?: boolean; keep?: boolean }) => ops.closeTab(key, tabKey, opts),
    returnToHome: (tabKey: string) => ops.returnToHome(key, tabKey),
    setOpen: (open: boolean) => ops.setPanelOpen(key, open),
    close: () => ops.setPanelOpen(key, false),
    toggle: (opts?: { emptyTab?: PanelTab }) => ops.togglePanel(key, opts),
    focusPane: (paneId: string) => ops.focusPane(key, paneId),
    splitPane: (paneId: string, dir: Parameters<typeof ops.splitPane>[2], side: Parameters<typeof ops.splitPane>[3], tabKey?: string) => ops.splitPane(key, paneId, dir, side, tabKey),
    moveTab: (tabKey: string, paneId: string, index?: number) => ops.moveTab(key, tabKey, paneId, index),
    closePane: (paneId: string) => ops.closePane(key, paneId),
    resizeSplit: (path: number[], sizes: number[]) => ops.resizeSplit(key, path, sizes),
    equalizeSplit: (path: number[]) => ops.equalizeSplit(key, path),
  };
}

/** タブをそろえない欄 */
const NO_SYNC: NonNullable<SurfaceSpec["sync"]> = { useSync: () => {} };

/**
 * 欄のパネル（チャット・新しいチャット・サブエージェント・ブラウザ・ターミナルのタブ）の状態と操作。ボードの右のパネル・右端のチャット欄・フッターで共通。
 * 状態は欄・画面ごとに店（panelStore）が覚え、変え方は純粋関数（panelState の panelReducer）。ここでは読む・そろえる・束ねるだけ。
 * タブは上下・左右のペインに分けて並べられる（配置は paneLayout の木。自分で開くタブはピントのあるペインに、
 * サイドバーと連動して自動で足すチャットのタブは一覧のペイン（homePane。分けた元のペイン）に入る）。
 * 表示は Panel（Esc・⌘\ も Panel の usePanelShortcuts）。大きさ（幅・高さ・最大化）は欄の殻（useBoardPanel・useProjectChat・useBottomPanel）が持つ。
 * surface は欄（決まりは欄の項目 SurfaceSpec。タブのまとめ方も欄ごとに覚える）、scope はどの画面の欄か（プロジェクト・全プロジェクト "all"・チャット。
 * 状態はこれで覚え、チャットのタブはこの範囲のサイドバーに出ているチャットにそろえる）
 */
export function usePanel(surface: PanelSurface, scope: PanelScope) {
  const key = panelKey(surface, scope);
  const state = usePanelState(key);
  const { tabs, layout, open: panelOpen } = state;
  useMountedPanel(key);
  const rules = surfaceOf(surface);
  // 持ち主がタブをそろえる（欄の決まりの sync。欄は描いている間に変わらないので、呼ぶ hook も変わらない）
  const sync = rules?.sync ?? NO_SYNC;
  sync.useSync(key, scope);
  const actions = useMemo(() => panelOps(key), [key]);
  const pageOps = useMemo<PanelPageOps>(
    () => ({
      ...actions,
      key,
      // 新しいチャットができたときの知らせは欄の決まり（URL をそのチャットにする・メインのウィンドウに知らせる）
      replaceWithChat: (tabKey, chat) => {
        actions.replaceTab(tabKey, chatTab(chat));
        rules?.onChatCreated?.(chat);
      },
    }),
    [actions, key, rules],
  );

  // 欄の状態・設定が同じ間は同じ物を返す（チャットの画面が描き直っても、右の欄のパネル（memo）を描き直させない）
  return useMemo(() => {
    /** 欄でこのタブを見せているか（分割していれば、どれかのペインで表示中） */
    const isShowingTab = (tabKey: string) => panelOpen && isTabVisible(layout, tabKey);

    return {
      ...pageOps,
      /** タブの中身に渡す操作（欄の状態が変わっても同じ物） */
      pageOps,
      /** 覚えておく名前（欄・画面ごと。panelKey） */
      key,
      tabs,
      surface,
      /** 出すタブの種類（欄の決まりの accepts） */
      kinds: new Set(rules?.accepts),
      /** 分割の配置 */
      layout,
      panelOpen,
      /** サイドバーに出ているチャットのタブか（ペインを閉じても一覧のペインへ戻すもの） */
      isLinkedTab: (tabKey: string) => isLinkedTab(state, tabKey, rules),
      isShowingTab,
      /** 欄でこのチャットを表示しているか（カードを選択中として見せる。分割していれば、どれかのペインで） */
      isShowing: (chatId: number) => isShowingTab(chatKey(chatId)),
    };
  }, [pageOps, key, state, tabs, layout, panelOpen, surface, rules]);
}
