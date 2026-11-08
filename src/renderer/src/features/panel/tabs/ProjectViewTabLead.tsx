import { Files, History, Search, type LucideIcon } from "lucide-react";
import type { PanelTab, ProjectView } from "./panelTypes";

/** プロジェクトの左の列のタブと同じアイコン */
export const PROJECT_VIEW_ICONS: Record<ProjectView, LucideIcon> = { files: Files, search: Search, history: History };

/** 右の欄のプロジェクトの画面（ファイル・検索・履歴）のタブの、名前の前のアイコン */
export function ProjectViewTabLead({ tab }: { tab: Extract<PanelTab, { kind: "projectView" }> }) {
  const Icon = PROJECT_VIEW_ICONS[tab.view];
  return <Icon size={12} className="muted" aria-hidden />;
}
