// 埋め込みブラウザのタブを開く口（ブラウザは右サイドバー = チャット欄（side）だけに置く）。
// チャット欄を別ウィンドウへ移しているときは、そのウィンドウに頼む（このウィンドウには欄の状態がないため）
import { postWindowMessage } from "@/app/windowBus";
import { writeSetting } from "@/lib/storage";
import { sideView } from "@/lib/storageKeys";
import { panelKey, projectOfPanel } from "@/features/panel/surfaces";
import { panelActions } from "./panelActions";
import { isSidePanel, sidePanelsHandedOut } from "./panelHandOff";

/** その欄にブラウザのタブを開く（チャット欄を別ウィンドウへ移していれば、そのウィンドウで） */
export function openBrowserTab(panel: string, url: string): void {
  showSideBrowser(panel);
  if (isSidePanel(panel) && sidePanelsHandedOut()) return postWindowMessage({ type: "sideOpenBrowser", panel, url });
  panelActions(panel).openBrowser(url);
}

/** そのプロジェクトの右サイドバー（チャット欄）にブラウザのタブを開く（ターミナルの ⌘ クリック・ポート・Docker・ワークツリーの「ブラウザで開く」） */
export const openSideBrowser = (projectId: number, url: string): void => openBrowserTab(panelKey("side", projectId), url);

/** 右サイドバーの中身をブラウザにする（ほかの中身を見ていても、開いたブラウザのタブが見えるように） */
export function showSideBrowser(panel: string): void {
  const projectId = isSidePanel(panel) ? projectOfPanel(panel) : null;
  if (projectId !== null) writeSetting(sideView(projectId), "browser");
}
