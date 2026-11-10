import { confirmCloseFileTab } from "@/features/editor/fileTabs";
import { confirmLeaveMemo } from "@/features/memo/memoGuards";
import type { PanelTab } from "./panelTypes";

/**
 * タブを閉じてよいか: 保存していない書きかけのあるファイル・メモのタブは、保存するかを聞く（ほかの種類はそのまま true）。
 * タブの ×・右クリックの「タブを閉じる」・ペインを閉じるで同じに聞く（前は × だけが聞き、ほかは書きかけを黙って捨てていた）
 */
export async function confirmCloseUnsaved(panelKey: string, tab: PanelTab): Promise<boolean> {
  if (tab.kind === "memo") return confirmLeaveMemo(tab.projectId, tab.path);
  if (tab.kind === "projectFile") return confirmCloseFileTab(panelKey, tab.key);
  return true;
}

/** 何枚かのタブを閉じてよいか（順に聞き、どれかでやめたら false） */
export async function confirmCloseAllUnsaved(panelKey: string, tabs: readonly PanelTab[]): Promise<boolean> {
  for (const tab of tabs) if (!(await confirmCloseUnsaved(panelKey, tab))) return false;
  return true;
}
