// プロジェクトの画面の表（projectViews.ts）の画面を描く
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import type { ProjectViewContext, ProjectViewDef } from "./projectViews";

/** 画面を描く（作業場所に付く画面は、見ている作業場所を中の部品に渡す） */
export function ProjectViewHost({ def, ctx }: { def: ProjectViewDef; ctx: Omit<ProjectViewContext, "view"> }) {
  const page = <def.Page {...ctx} view={def.id} />;
  if (!def.followsWorkplace) return page;
  return <WorkplaceProvider value={{ projectId: ctx.project.id, worktree: ctx.worktree }}>{page}</WorkplaceProvider>;
}
