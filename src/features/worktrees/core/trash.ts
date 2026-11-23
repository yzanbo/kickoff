// ゴミ箱の種類 "worktree": 消したワークツリーの控え（refs/kickoff/trash/<id>/）から作り直す・3 日たったら控えを消す
import type { Project } from "@shared/projects/types";
import type { WorktreeTrashDetails } from "@shared/trash/types";
import type { TrashApi } from "@/features/trash/core/index";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { git } from "@/foundation/core/workplace/git";
import { hasRef } from "@/foundation/core/workplace/reads";
import { applySnapshot, dropTrashRefs, trashRef } from "./backup";
import type { WorktreeEvents } from "./events";
import type { WorktreeService } from "./service";

interface WorktreeTrashDeps {
  projects: { get(id: number): Project | undefined };
  create: WorktreeService["create"];
  events: Pick<WorktreeEvents, "changed">;
}

/** ゴミ箱に種類 "worktree" を登録する（戻す: 同じ名前のブランチ（なければ控えのブランチの先から作る）でワークツリーを作り直し、途中の変更を戻す） */
export function registerWorktreeTrash(trashBin: TrashApi, deps: WorktreeTrashDeps): void {
  const projectOf = (projectId: number | null) => (projectId !== null ? deps.projects.get(projectId) : undefined);
  trashBin.registerKind({
    kind: "worktree",
    restore: async (item) => {
      const details = item.details as WorktreeTrashDetails;
      const project = projectOf(item.project_id);
      if (!project) throw new NotFound("ワークツリーのプロジェクトが見つかりません");
      if (!details.branch) throw new Invalid("ブランチのないワークツリーは戻せません");
      const repo = project.repo_path;
      if (!(await hasRef(repo, `refs/heads/${details.branch}`))) {
        const from = details.has_branch_ref ? trashRef(item.id, "branch") : details.head;
        if (!from) throw new Invalid("ワークツリーのブランチの先が分からないので戻せません");
        await git(repo).run(["branch", details.branch, from]);
      }
      const { worktree: made } = await deps.create(project, details.branch);
      if (made && details.has_changes_ref) await applySnapshot(made.root, trashRef(item.id, "changes"));
      await dropTrashRefs(repo, item.id);
      await deps.events.changed();
    },
    // 3 日たったら控えの参照を消す
    purge: async (item) => {
      const project = projectOf(item.project_id);
      if (project) await dropTrashRefs(project.repo_path, item.id);
    },
  });
}
