import { SquarePen } from "lucide-react";
import { isCommonProject } from "@shared/projects/kinds";
import { commonFirst } from "@shared/projects/order";
import type { PaletteItem } from "@/features/palette/ui";
import { ProjectMark } from "./ProjectMark";
import { useProjects } from "./stores/projects";


export function useProjectItems(enabled: boolean, query: string): readonly PaletteItem[] {
  // すべてのプロジェクト（しまったものも出す）。共通はサイドバーと同じく先頭に
  const projects = commonFirst(useProjects().projects);
  const typed = query.trim() !== "";
  if (!enabled) return NONE;
  const items: PaletteItem[] = [];
  if (typed) {
    for (const p of projects) {
      const label = isCommonProject(p) ? "共通で新しいチャット" : `${p.name} で新しいチャット`;
      items.push({ key: `new-${p.id}`, label, text: label, hint: "新規", icon: <SquarePen size={15} />, route: { name: "newChat", projectId: p.id } });
    }
  }
  for (const p of projects) {
    items.push({ key: `p-${p.id}`, label: p.name, text: p.name, hint: isCommonProject(p) ? "共通のチャット" : "プロジェクト", icon: <ProjectMark project={p} />, route: { name: "project", id: p.id, tab: "board" } });
  }
  return items;
}

const NONE: readonly PaletteItem[] = [];
