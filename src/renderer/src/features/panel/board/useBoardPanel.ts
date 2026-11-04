import type { Chat, Project } from "@shared/types";
import { usePanelDrafts } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import { usePanel } from "@/features/panel/usePanel";

/**
 * ボード（カンバン・グループのボード）の右のパネル。列の分け方（状態 / グループ）を切り替えても、開閉・タブ・分割はそのまま（同じ panelKey）。
 * drafts はボードに出す下書き（このボードのパネルと、同じプロジェクトのチャット欄で書いている途中のもの。いちばん左の「下書き」の列・グループに出す）
 */
export function useBoardPanel({
  projectId,
  holdEsc,
  projects,
  onCreated,
}: {
  /** 未指定なら全プロジェクトのボード */
  projectId?: number;
  /** true の間は Esc でパネルを閉じない（カードのメニューが開いているとき） */
  holdEsc: boolean;
  /** 全プロジェクトのボードでは、新しいチャットのプロジェクトを選べるようにする */
  projects?: Project[];
  onCreated?: (chat: Chat) => void;
}) {
  const panel = usePanel({ surface: "board", scope: projectId ?? "all", holdEsc, projects, onCreated });
  const drafts = usePanelDrafts(projectId === undefined ? [panel.key] : [panel.key, panelKey("side", projectId)]);
  return { panel, drafts };
}
