import type { GitCommitDetail, GitDiff, GitFileChange, GitLog, GitRefs, GitStatus, PullRequestInfo } from "@shared/types";
import { request } from "./http";
import { workdirPath, type GitTarget } from "./workdir";

/**
 * 作業場所の Git（状態・差分・ステージ・コミット・プッシュ・プル・履歴・PR。コアの routes/git.ts）。
 * 操作したら、終わったあとの状態（GitStatus）が返る
 */
export const gitApi = {
  gitStatus: (target: GitTarget) => request<GitStatus>("GET", workdirPath(target, "/git/status")),
  /** ステージ・ステージの取り消し・変更を元に戻す */
  gitAction: (target: GitTarget, action: "stage" | "unstage" | "discard", paths: string[]) =>
    request<GitStatus>("POST", workdirPath(target, `/git/${action}`), { paths }),
  gitCommit: (target: GitTarget, message: string) => request<GitStatus>("POST", workdirPath(target, "/git/commit"), { message }),
  gitPush: (target: GitTarget) => request<GitStatus>("POST", workdirPath(target, "/git/push")),
  gitPull: (target: GitTarget) => request<GitStatus>("POST", workdirPath(target, "/git/pull")),
  gitFetch: (target: GitTarget) => request<GitStatus>("POST", workdirPath(target, "/git/fetch")),
  /** 変更のあるファイルの差分（staged ならステージしたもの） */
  gitDiff: (target: GitTarget, file: GitFileChange, staged: boolean) =>
    request<GitDiff>("GET", workdirPath(target, "/git/diff", { path: file.path, staged, old: file.old_path })),
  /** 作業場所のブランチの PR（なければ null）と、PR を作る（まだプッシュしていなければ先にプッシュする） */
  pullRequest: (target: GitTarget) => request<PullRequestInfo | null>("GET", workdirPath(target, "/git/pr")),
  createPullRequest: (target: GitTarget) => request<PullRequestInfo>("POST", workdirPath(target, "/git/pr")),
  // 履歴（読むだけ）
  gitLog: (target: GitTarget, skip = 0) => request<GitLog>("GET", workdirPath(target, "/git/log", { skip })),
  gitRefs: (target: GitTarget) => request<GitRefs>("GET", workdirPath(target, "/git/refs")),
  gitCommitDetail: (target: GitTarget, hash: string) => request<GitCommitDetail>("GET", workdirPath(target, `/git/commits/${hash}`)),
  gitCommitDiff: (target: GitTarget, hash: string, file: GitFileChange) =>
    request<GitDiff>("GET", workdirPath(target, `/git/commits/${hash}/diff`, { path: file.path, old: file.old_path })),
};
