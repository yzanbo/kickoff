import { useEffect } from "react";
import { setAgentBrowsing } from "./agentBrowsing";
import { addTabBehind, allPanels, browserTab, isPanelMounted, isTabShown, openTab, panelKey, panelOfTab, showTab } from "@/features/panel/ui";
import { showSideBrowser } from "@/features/browser/ui/panel/openBrowserTab";

/** いまの欄の状態（画面に出ている欄だけを数える） */
const panelsView = () => ({ panels: allPanels(), mounted: isPanelMounted });

/** 表に出してよいか（after = この作業で前に表に出したタブ。あれば、利用者がまだそれを見ているときだけ） */
const mayReveal = (after: string | null) => after === null || isTabShown(panelsView(), after);

/**
 * AI（チャットのエージェント）による埋め込みブラウザの操作の、画面の側の受け口（メインプロセスの browser/desktop/agent/ と対）。
 * 新しいタブを頼まれたら、そのプロジェクトのチャット欄にブラウザのタブを足して返す。作業の初めに使うタブは、その欄を開いて表示中にする
 * （利用者が AI の操作に気づけるように。別のチャットを見ていても開く。キーボードのピントは動かさない。裏でと頼まれた・利用者が
 * ほかのタブに切り替えた・欄を閉じたあとは、見ているタブ・欄の開閉を変えない）。操作しているタブの知らせで「AI 操作中」の印を出す・消す
 */
export function useAgentBrowserBridge() {
  useEffect(() => {
    const api = window.kickoff?.agentBrowser;
    if (!api) return;
    const offOpen = api.onOpenRequest((requestId, projectId, url, reveal, after) => {
      const key = panelKey("side", projectId);
      // チャット欄はいま出ているプロジェクトの分だけ描いている（ほかのプロジェクトのタブには webview がない）
      if (!isPanelMounted(key)) {
        api.opened(requestId, null, false, "このプロジェクトが Kickoff の画面に出ていないため、タブを開けません。利用者にこのプロジェクトを開いてもらってください。");
        return;
      }
      const show = reveal && mayReveal(after);
      // 表に出すときは、右サイドバーの中身もブラウザにする（ほかの中身を見ていても気づけるように）
      if (show) showSideBrowser(key);
      const tab = browserTab(url);
      if (show) openTab(key, tab);
      else addTabBehind(key, tab);
      const tabKey = tab.key;
      setAgentBrowsing(tabKey, true);
      api.opened(requestId, tabKey, show, null);
    });
    const offReveal = api.onRevealRequest((requestId, tabKey, after) => {
      const key = panelOfTab(panelsView(), tabKey);
      const show = key !== null && mayReveal(after);
      if (show) {
        showSideBrowser(key);
        showTab(key, tabKey);
      }
      api.revealed(requestId, show);
    });
    const offActivity = api.onActivity((tabKey, active) => setAgentBrowsing(tabKey, active));
    return () => {
      offOpen();
      offReveal();
      offActivity();
    };
  }, []);
}
