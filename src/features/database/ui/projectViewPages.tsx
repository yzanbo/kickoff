// database がプロジェクトの画面の表（projectViews）に出す画面の中身
import type { ProjectViewContext } from "@/features/projects/ui";
import { LazyDatabaseClient } from "./LazyDatabaseClient";

/** SQLite のファイルは、見ている作業場所の中を開く */
export const DatabaseViewPage = ({ project, worktree }: ProjectViewContext) => (
  <LazyDatabaseClient key={project.id} projectId={project.id} place={`project-${project.id}`} worktree={worktree} />
);
