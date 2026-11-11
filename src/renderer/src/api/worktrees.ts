import type { BranchSuggestions, GitWorktree, WorktreePrNotice, WorktreeRemovalInfo } from "@shared/types";
import { request, withQuery } from "./http";

/** プロジェクトのワークツリー（一覧・作る・消す。コアの routes/worktrees.ts）。作る・消すと、そのあとの一覧が返る */
export const worktreesApi = {
  gitWorktrees: (projectId: number) => request<GitWorktree[]>("GET", `/api/projects/${projectId}/git/worktrees`),
  addWorktree: (projectId: number, branch: string) => request<GitWorktree[]>("POST", `/api/projects/${projectId}/git/worktrees`, { branch }),
  /** ワークツリーを消す（force: コミットしていない変更があっても。deleteBranch: ブランチも消す = PR がマージされたあとの片付け） */
  removeWorktree: (projectId: number, path: string, force = false, deleteBranch = false) =>
    request<GitWorktree[]>("POST", `/api/projects/${projectId}/git/worktrees/remove`, { path, force, delete_branch: deleteBranch }),
  /** ワークツリーを消す前の確かめ（コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミット） */
  worktreeRemovalInfo: (projectId: number, path: string) =>
    request<WorktreeRemovalInfo>("GET", withQuery(`/api/projects/${projectId}/git/worktrees/info`, { path })),
  /** ワークツリーの PR の知らせ（マージされた・マージせずに閉じられた。コアの routes/worktreePrs.ts） */
  worktreePrs: () => request<WorktreePrNotice[]>("GET", "/api/worktree-prs"),
  /** 窓に戻ったときに GitHub に聞き直す（30 秒以内はまとめる）。聞き直したあとの知らせ */
  refreshWorktreePrs: () => request<WorktreePrNotice[]>("POST", "/api/worktree-prs/refresh"),
  /** 確認を閉じた（同じ PR では確認を出し直さない） */
  dismissWorktreePr: (projectId: number, prNumber: number) => request<void>("POST", `/api/projects/${projectId}/worktree-prs/${prNumber}/dismiss`),
  /** やりたいことの文から、新しいワークツリーのブランチ名の案を AI に作ってもらう（いまあるブランチとかぶらないもの） */
  suggestBranches: (projectId: number, summary: string) =>
    request<BranchSuggestions>("POST", `/api/projects/${projectId}/git/branch-suggestions`, { summary }),
};
