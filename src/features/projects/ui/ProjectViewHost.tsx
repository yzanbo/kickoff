// プロジェクトの画面の表（projectViews.ts）の画面を描く
import { UnsavedSurfaceContext } from "@/foundation/ui/document/unsaved";
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import type { ProjectViewContext, ProjectViewDef } from "./projectViews";
import { projectViewSurface } from "./viewLeave";

/** 画面を描く（中の文書の書きかけはこの画面の置き場所の名前で出す。作業場所に付く画面は、見ている作業場所を中の部品に渡す） */
export function ProjectViewHost({ def, ctx }: { def: ProjectViewDef; ctx: Omit<ProjectViewContext, "view"> }) {
  const unsavedSurface = projectViewSurface({ place: ctx.place, projectId: ctx.project.id, chatId: ctx.chatId, view: def.id });
  const page = (
    <UnsavedSurfaceContext value={unsavedSurface}>
      <def.Page {...ctx} view={def.id} />
    </UnsavedSurfaceContext>
  );
  if (!def.followsWorkplace) return page;
  return <WorkplaceProvider value={{ projectId: ctx.project.id, worktree: ctx.worktree }}>{page}</WorkplaceProvider>;
}
