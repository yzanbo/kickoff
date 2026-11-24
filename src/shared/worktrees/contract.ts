// ワークツリーの取り決め（一覧・ブランチ名の案・作る・［AI で整える］・消す前の確かめ・消す）。受け口は src/features/worktrees/core/routes/worktrees.ts
// 作る・消すと、そのあとの一覧（実行環境と作業場所の色つき）を返す。PR の知らせ（/api/worktree-prs）はまだ取り決めの外（P8-2d で github へ）
import { route, type Contract } from "@shared/foundation/contract";
import type { BranchSuggestBody, BranchSuggestions, WorktreeRemovalInfo } from "@shared/git/types";
import type { GitWorktree } from "@shared/foundation/workplace";
import type { WorktreeEnvSetupBody, WorktreeEnvSetupResult } from "./envTypes";

/**
 * 消し方（force: コミットしていない変更があっても消す。delete_branch: 取り出していたブランチも消す = PR がマージされたあとの片付け。
 * down_volumes: Kickoff が組の名前を割り当てたワークツリーなら、その組のコンテナとデータも消す。drop_db_connections: このワークツリーの DB から作った接続も消す）
 */
export interface WorktreeRemoveBody {
  path: string;
  force?: boolean;
  delete_branch?: boolean;
  down_volumes?: boolean;
  drop_db_connections?: boolean;
}

export const worktreesContract = {
  /** 一覧（Git で管理していないフォルダは空。HEAD の見張りもここで一覧に合わせる） */
  "GET /api/projects/:projectId/git/worktrees": route<never, GitWorktree[]>(),
  /** やりたいことの概要から、新しいワークツリーのブランチ名の案（AI に 1 回だけ聞く） */
  "POST /api/projects/:projectId/git/branch-suggestions": route<BranchSuggestBody, BranchSuggestions>(),
  "POST /api/projects/:projectId/git/worktrees": route<{ branch: string }, GitWorktree[]>({ status: 201 }),
  /** ［AI で整える］（覚えのないワークツリーなら先に手順を流し、そのワークツリーでチャットを始める） */
  "POST /api/projects/:projectId/git/worktrees/env-setup": route<WorktreeEnvSetupBody, WorktreeEnvSetupResult>({ status: 201 }),
  /** 消す前の確かめ（コミットしていない変更・プッシュしていないコミット・このワークツリーの DB から作った接続） */
  "GET /api/projects/:projectId/git/worktrees/info": route<never, WorktreeRemovalInfo, { path: string }>(),
  "POST /api/projects/:projectId/git/worktrees/remove": route<WorktreeRemoveBody, GitWorktree[]>(),
} as const satisfies Contract;
