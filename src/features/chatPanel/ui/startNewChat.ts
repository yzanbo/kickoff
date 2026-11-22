import { openNoProjectsGuide } from "@/features/projects/ui";
import { parsePanelKey, type PanelController } from "@/features/panel/ui";
import { openNewChat } from "./drafts/panelDrafts";

/**
 * 欄の「新しいチャット」（タブのすぐ右のボタン・タブがないときのボタン・タブの右クリック）。チャットのパネルはその欄のプロジェクトで始め、
 * 作成先の決まらない欄（チャットの別ウィンドウ）は、チャットはプロジェクトの中で始めることを案内する
 */
export function startNewChat(panel: PanelController): void {
  const scope = parsePanelKey(panel.key)?.scope;
  if (typeof scope === "number") openNewChat(panel.key, { projectId: scope });
  else openNoProjectsGuide();
}
