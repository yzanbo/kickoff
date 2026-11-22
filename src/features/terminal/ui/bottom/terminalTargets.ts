import type { Project } from "@shared/projects/types";
import { sidebarOrder } from "@/features/projects/ui";
import type { TerminalTarget } from "@/features/panel/ui";

/** フッターのタブの列の＋から開けるターミナル（プロジェクトの画面はそのプロジェクトの本体、全プロジェクトの画面は各プロジェクト） */
export function terminalTargets(projects: Project[], projectId?: number): TerminalTarget[] {
  const list = projectId === undefined ? sidebarOrder(projects) : projects.filter((p) => p.id === projectId);
  return list.map((p) => ({ cwd: p.repo_path, label: p.name, projectId: p.id }));
}
