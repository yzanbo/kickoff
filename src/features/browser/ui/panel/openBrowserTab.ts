// 埋め込みブラウザのタブを開く口（ブラウザは右サイドバー = チャット欄（side）だけに置く）。
// チャット欄を別ウィンドウへ移しているときは、そのウィンドウに頼む（このウィンドウには欄の状態がないため）
import { postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { writeSetting } from "@/foundation/ui/storage";
import { projectsSettings } from "@/features/projects/ui";
import { panelKey, projectOfPanel } from "@/features/panel/ui/surfaces";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { isSidePanel, sidePanelsHandedOut } from "@/features/panel/ui/state/panelHandOff";

/** その欄にブラウザのタブを開く（チャット欄を別ウィンドウへ移していれば、そのウィンドウで） */
export function openBrowserTab(panel: string, url: string): void {
  showSideBrowser(panel);
  if (isSidePanel(panel) && sidePanelsHandedOut()) return postWindowMessage("sideOpenBrowser", { panel, url });
  panelActions(panel).openBrowser(url);
}

/** そのプロジェクトの右サイドバー（チャット欄）にブラウザのタブを開く（ターミナルの ⌘ クリック・ポート・Docker・ワークツリーの「ブラウザで開く」） */
export const openSideBrowser = (projectId: number, url: string): void => openBrowserTab(panelKey("side", projectId), url);

/** 右サイドバーの中身をブラウザにする（ほかの中身を見ていても、開いたブラウザのタブが見えるように） */
export function showSideBrowser(panel: string): void {
  const projectId = isSidePanel(panel) ? projectOfPanel(panel) : null;
  if (projectId !== null) writeSetting(projectsSettings.sideView(projectId), "browser");
}
