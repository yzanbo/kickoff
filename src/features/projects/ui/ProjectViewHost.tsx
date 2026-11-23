// プロジェクトの画面の表（projectViews.ts）の画面を描く
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import type { ProjectViewContext, ProjectViewDef } from "./projectViews";
import { projectViewSurface } from "./viewLeave";

/** 画面を描く（作業場所に付く画面は、見ている作業場所を中の部品に渡す） */
export function ProjectViewHost({ def, ctx }: { def: ProjectViewDef; ctx: Omit<ProjectViewContext, "view" | "unsavedSurface"> }) {
  const unsavedSurface = projectViewSurface({ place: ctx.place, projectId: ctx.project.id, chatId: ctx.chatId, view: def.id });
  const page = <def.Page {...ctx} view={def.id} unsavedSurface={unsavedSurface} />;
  if (!def.followsWorkplace) return page;
  return <WorkplaceProvider value={{ projectId: ctx.project.id, worktree: ctx.worktree }}>{page}</WorkplaceProvider>;
}
