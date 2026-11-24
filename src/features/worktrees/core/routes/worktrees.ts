// ワークツリーの受け口（取り決め @shared/worktrees/contract.ts）。手続きは WorktreeService、消すのは WorktreeRemover
import { z } from "zod";
import type { Project } from "@shared/projects/types";
import type { BranchSuggestBody } from "@shared/git/types";
import { worktreesContract } from "@shared/worktrees/contract";
import { removalInfo } from "@/features/worktrees/core/inspect";
import type { WorktreeRemover } from "@/features/worktrees/core/remove";
import type { WorktreeService } from "@/features/worktrees/core/service";
import { implement, type Param } from "@/foundation/core/http/implement";
import { branchName, folderPath } from "@/foundation/core/http/zodParts";

/** ブランチ名の案を頼む本文（やりたいことの概要） */
const branchSuggestSchema = z.object({ summary: z.string().trim().min(1).max(4000) }) satisfies z.ZodType<BranchSuggestBody>;

/** 受け口が使うもの */
interface WorktreeRouteDeps {
  projectParam: Param<Project>;
  service: WorktreeService;
  remover: WorktreeRemover;
  /** ワークツリーの DB から作った接続（database が登録する。名前だけ） */
  connectionsIn: (folder: string) => { id: number; name: string }[];
}

/**
 * ワークツリー（一覧・作る・消す）。PR がマージされたあとの片付けは、ブランチも消す（delete_branch）「消す」。
 * 新しいワークツリーのブランチ名の案は branch-suggestions（やりたいことの概要から、プロジェクトの AI に 1 回だけ聞く）
 */
export function worktreeRoutes({ projectParam, service, remover, connectionsIn }: WorktreeRouteDeps) {
  return implement(worktreesContract, {
    context: { projectId: projectParam },
    "GET /api/projects/:projectId/git/worktrees": { run: ({ projectId }) => service.list(projectId) },
    "POST /api/projects/:projectId/git/branch-suggestions": { body: branchSuggestSchema, run: ({ projectId, body }) => service.suggestBranches(projectId, body.summary) },
    // 作ったら、ポートの帯と組の名前を割り当てる（ワークツリーの実行環境）
    "POST /api/projects/:projectId/git/worktrees": {
      body: z.object({ branch: branchName }),
      run: async ({ projectId: project, body }) => service.present(project.id, (await service.create(project, body.branch)).list),
    },
    "POST /api/projects/:projectId/git/worktrees/env-setup": { body: z.object({ path: folderPath }), run: ({ projectId, body }) => service.startEnvSetup(projectId, body.path) },
    // 消す前の確かめ（コミットしていない変更・プッシュしていないコミット）と、このワークツリーの DB から作った接続（消す確認の「この接続も消す」。名前だけ）
    "GET /api/projects/:projectId/git/worktrees/info": {
      query: z.object({ path: folderPath }),
      run: async ({ projectId, query }) => ({ ...(await removalInfo(projectId.repo_path, query.path)), db_connections: connectionsIn(query.path) }),
    },
    /**
     * ワークツリーを消す（down_volumes: Kickoff が組の名前を割り当てたワークツリーなら、その組のコンテナとデータも docker compose down -v で消す。
     * drop_db_connections: 消さなければ、どのワークツリーのものかだけ外す）。ポートの帯は空ける。中身は AI の finish_worktree と同じ WorktreeRemover
     * （失うものは Kickoff のゴミ箱に 3 日残る控えに入れてから消す。そこで作業していたチャットは本体に戻してお知らせを残す）。残ったワークツリーの一覧を返す
     */
    "POST /api/projects/:projectId/git/worktrees/remove": {
      body: z.object({
        path: folderPath,
        force: z.boolean().default(false),
        delete_branch: z.boolean().default(false),
        down_volumes: z.boolean().default(false),
        drop_db_connections: z.boolean().default(false),
      }),
      run: async ({ projectId: project, body }) => {
        const { worktrees } = await remover.remove(project, body.path, {
          force: body.force,
          deleteBranch: body.delete_branch,
          downVolumes: body.down_volumes,
          dropDbConnections: body.drop_db_connections,
          deleteMergedRemote: false,
          byChatId: null,
        });
        return service.present(project.id, worktrees);
      },
    },
  });
}
