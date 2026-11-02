import { createContext, useContext } from "react";
import type { ProjectSummary } from "../../core/types";

/** アプリ全体のプロジェクトの一覧と、ID からの引き当て（App が読み込むたびに作り直す） */
export interface ProjectsIndex {
  /** すべてのプロジェクト（しまったものも含む。並びは API のまま） */
  projects: ProjectSummary[];
  projectsById: ReadonlyMap<number, ProjectSummary>;
  /** プロジェクト名（まだ分からなければ空） */
  projectName: (id: number) => string;
}

export function indexProjects(projects: ProjectSummary[]): ProjectsIndex {
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  return { projects, projectsById, projectName: (id) => projectsById.get(id)?.name ?? "" };
}

/** App で 1 回入れ、プロジェクトの一覧や名前が要る部品は props で中継せずにここから読む */
export const ProjectsContext = createContext<ProjectsIndex>(indexProjects([]));
export const useProjects = () => useContext(ProjectsContext);
