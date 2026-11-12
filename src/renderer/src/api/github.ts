import type { Chat, GitHubConnection, GitHubIssueDetail, GitHubItemPage, GitHubLink, GitHubListFilter, GitHubPullDetail, GitHubPullFiles, GitHubPullWorktree, GitHubRepoMeta } from "@shared/types";
import { request, withQuery } from "./http";

/** GitHub タブ（連携先のリポジトリの issue・PR を読む。コアの routes/github.ts）。中身はいつも GitHub に聞き直したもの */
export const githubApi = {
  /** 連携の状態（使えなければ reason に理由と直し方） */
  githubConnection: (projectId: number) => request<GitHubConnection>("GET", `/api/projects/${projectId}/github/connection`),
  /** 絞り込みの候補（ラベル・マイルストーン・担当にできる人） */
  githubMeta: (projectId: number) => request<GitHubRepoMeta>("GET", `/api/projects/${projectId}/github/meta`),
  /** 一覧（cursor = 続き。refresh = 覚えたものを使わずに聞き直す） */
  githubItems: (projectId: number, f: GitHubListFilter, opts: { cursor?: string | null; refresh?: boolean } = {}) =>
    request<GitHubItemPage>(
      "GET",
      withQuery(`/api/projects/${projectId}/github/items`, {
        kind: f.kind,
        state: f.state,
        mine: f.mine,
        labels: f.labels.length ? f.labels.join(",") : null,
        assignee: f.assignee,
        milestone: f.milestone,
        q: f.text.trim() || null,
        sort: f.sort,
        cursor: opts.cursor,
        refresh: opts.refresh ? "1" : null,
      }),
    ),
  githubIssue: (projectId: number, number: number) => request<GitHubIssueDetail>("GET", `/api/projects/${projectId}/github/issues/${number}`),
  githubPull: (projectId: number, number: number) => request<GitHubPullDetail>("GET", `/api/projects/${projectId}/github/pulls/${number}`),
  githubPullFiles: (projectId: number, number: number) => request<GitHubPullFiles>("GET", `/api/projects/${projectId}/github/pulls/${number}/files`),
  /** PR のブランチのワークツリー（いまあればそれ、なければ PR の元のブランチを取ってきて作る。レビューコメントで直す） */
  githubPullWorktree: (projectId: number, number: number) => request<GitHubPullWorktree>("POST", `/api/projects/${projectId}/github/pulls/${number}/worktree`),
  /** チャットに issue・PR を結び付ける（並び順は変えない） */
  setChatGitHub: (chatId: number, link: GitHubLink) => request<Chat>("PUT", `/api/chats/${chatId}/github`, link),
  /** チャットの結び付きを外す */
  clearChatGitHub: (chatId: number) => request<Chat>("DELETE", `/api/chats/${chatId}/github`),
};
