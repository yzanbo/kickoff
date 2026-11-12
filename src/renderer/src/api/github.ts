import type {
  Chat,
  GitHubCheckoutPlace,
  GitHubConnection,
  GitHubCreatedIssue,
  GitHubIssueDetail,
  GitHubItemPage,
  GitHubKind,
  GitHubLabel,
  GitHubLink,
  GitHubListFilter,
  GitHubMergeBody,
  GitHubMergeResult,
  GitHubNewIssueBody,
  GitHubPullDetail,
  GitHubPullFiles,
  GitHubPullWorktree,
  GitHubRepoMeta,
  GitHubReviewBody,
  GitHubStateBody,
} from "@shared/types";
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
  // ---- 書き込み（段階 3）。様子が変わるだけのものは何も返さないので、呼んだ側が中身を取り直す ----
  /** issue・PR にコメント（Markdown） */
  githubComment: (projectId: number, number: number, body: string) => request<void>("POST", `/api/projects/${projectId}/github/items/${number}/comments`, { body }),
  /** 閉じる / 開き直す（reason は issue を閉じるときの閉じ方） */
  githubSetState: (projectId: number, kind: GitHubKind, number: number, body: GitHubStateBody) =>
    request<void>("POST", `/api/projects/${projectId}/github/${kind === "pr" ? "pulls" : "issues"}/${number}/state`, body),
  /** ラベルを置き換える（付けるものすべて）。付いたあとのラベル */
  githubSetLabels: (projectId: number, number: number, labels: string[]) => request<GitHubLabel[]>("PUT", `/api/projects/${projectId}/github/items/${number}/labels`, { labels }),
  githubCreateIssue: (projectId: number, body: GitHubNewIssueBody) => request<GitHubCreatedIssue>("POST", `/api/projects/${projectId}/github/issues`, body),
  /** PR のレビューを送る（ためた行のコメントもまとめて） */
  githubReview: (projectId: number, number: number, body: GitHubReviewBody) => request<void>("POST", `/api/projects/${projectId}/github/pulls/${number}/reviews`, body),
  githubReplyThread: (projectId: number, number: number, threadId: string, body: string) =>
    request<void>("POST", `/api/projects/${projectId}/github/pulls/${number}/threads/${encodeURIComponent(threadId)}/replies`, { body }),
  githubResolveThread: (projectId: number, number: number, threadId: string, resolved: boolean) =>
    request<void>("POST", `/api/projects/${projectId}/github/pulls/${number}/threads/${encodeURIComponent(threadId)}/resolve`, { resolved }),
  githubMerge: (projectId: number, number: number, body: GitHubMergeBody) => request<GitHubMergeResult>("POST", `/api/projects/${projectId}/github/pulls/${number}/merge`, body),
  /** PR のブランチを取り出す（worktree = ワークツリー / main = 本体のブランチを切り替える） */
  githubCheckout: (projectId: number, number: number, place: GitHubCheckoutPlace) =>
    request<GitHubPullWorktree>("POST", `/api/projects/${projectId}/github/pulls/${number}/checkout`, { place }),
  /** チャットに issue・PR を結び付ける（並び順は変えない） */
  setChatGitHub: (chatId: number, link: GitHubLink) => request<Chat>("PUT", `/api/chats/${chatId}/github`, link),
  /** チャットの結び付きを外す */
  clearChatGitHub: (chatId: number) => request<Chat>("DELETE", `/api/chats/${chatId}/github`),
};
