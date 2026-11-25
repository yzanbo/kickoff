import type { Project } from "@shared/projects/types";
import { terminalFolderOf } from "@shared/terminal/folder";
import { sidebarOrder } from "@/features/projects/ui";
import type { TerminalTarget } from "@/features/panel/ui";

/**
 * フッターのタブの列の＋から開けるターミナル（プロジェクトの画面はそのプロジェクト、全プロジェクトの画面は共通を先頭に各プロジェクト）。
 * 開くフォルダは terminalFolderOf（プロジェクトは本体、共通はホームフォルダ）
 */
export function terminalTargets(projects: Project[], projectId?: number): TerminalTarget[] {
  const list = projectId === undefined ? sidebarOrder(projects) : projects.filter((p) => p.id === projectId);
  return list.map((p) => ({ cwd: terminalFolderOf(p), label: p.name, projectId: p.id }));
}
