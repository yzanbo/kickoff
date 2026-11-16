// 埋め込みブラウザのタブを開く口（ブラウザは右サイドバー = チャット欄（side）だけに置く。利用者の依頼）。
// チャット欄を別ウィンドウへ移しているときは、そのウィンドウに頼む（このウィンドウには欄の状態がないため）
import { postWindowMessage } from "@/app/windowBus";
import { panelKey } from "@/features/panel/surfaces";
import { panelActions } from "./panelActions";
import { isSidePanel, sidePanelsHandedOut } from "./panelHandOff";

/** その欄にブラウザのタブを開く（チャット欄を別ウィンドウへ移していれば、そのウィンドウで） */
export function openBrowserTab(panel: string, url: string): void {
  if (isSidePanel(panel) && sidePanelsHandedOut()) return postWindowMessage({ type: "sideOpenBrowser", panel, url });
  panelActions(panel).openBrowser(url);
}

/** そのプロジェクトの右サイドバー（チャット欄）にブラウザのタブを開く（ターミナルの ⌘ クリック・ポート・Docker・ワークツリーの「ブラウザで開く」） */
export const openSideBrowser = (projectId: number, url: string): void => openBrowserTab(panelKey("side", projectId), url);
