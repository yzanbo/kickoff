import { SquarePen } from "lucide-react";
import { isListedProject } from "@shared/projects/kinds";
import type { PaletteItem } from "@/features/palette/ui";
import { ProjectMark } from "./ProjectMark";
import { useProjects } from "./stores/projects";


export function useProjectItems(enabled: boolean, query: string): readonly PaletteItem[] {
  // 見えないプロジェクトは選べる先に出さない（しまったものは今どおり出す）
  const projects = useProjects().projects.filter(isListedProject);
  const typed = query.trim() !== "";
  if (!enabled) return NONE;
  const items: PaletteItem[] = [];
  if (typed) {
    for (const p of projects) {
      const label = `${p.name} で新しいチャット`;
      items.push({ key: `new-${p.id}`, label, text: label, hint: "新規", icon: <SquarePen size={15} />, route: { name: "newChat", projectId: p.id } });
    }
  }
  for (const p of projects) {
    items.push({ key: `p-${p.id}`, label: p.name, text: p.name, hint: "プロジェクト", icon: <ProjectMark project={p} />, route: { name: "project", id: p.id, tab: "board" } });
  }
  return items;
}

const NONE: readonly PaletteItem[] = [];
