import { useEffect } from "react";
import { setAgentBrowsing } from "@/features/browser/agentBrowsing";
import { panelActions } from "@/features/panel/state/panelActions";
import { isPanelMounted } from "@/features/panel/state/panelStore";
import { panelKey } from "@/features/panel/surfaces";

/**
 * AI（チャットのエージェント）による埋め込みブラウザの操作の、画面の側の受け口（メインプロセスの browser/agentBrowser.ts と対）。
 * 新しいタブを頼まれたら、そのプロジェクトのチャット欄に表に出さずにブラウザのタブを足して返す（見ているタブ・欄の開閉は変えない）。
 * 操作しているタブの知らせで「AI 操作中」の印を出す・消す
 */
export function useAgentBrowserBridge() {
  useEffect(() => {
    const api = window.kickoff?.agentBrowser;
    if (!api) return;
    const offOpen = api.onOpenRequest((requestId, projectId, url) => {
      const key = panelKey("side", projectId);
      // チャット欄はいま出ているプロジェクトの分だけ描いている（ほかのプロジェクトのタブには webview がない）
      if (!isPanelMounted(key)) {
        api.opened(requestId, null, "このプロジェクトが Kickoff の画面に出ていないため、タブを開けません。利用者にこのプロジェクトを開いてもらってください。");
        return;
      }
      const tabKey = panelActions(key).addBrowserBehind(url);
      setAgentBrowsing(tabKey, true);
      api.opened(requestId, tabKey, null);
    });
    const offActivity = api.onActivity((tabKey, active) => setAgentBrowsing(tabKey, active));
    return () => {
      offOpen();
      offActivity();
    };
  }, []);
}
