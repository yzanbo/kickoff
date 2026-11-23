// いま開いている issue・PR の中身が、本文・行のスレッドに渡すもの（GitHubDetail の DetailBody が置く）
import { createContext, useContext } from "react";
import { GITHUB_DEFAULT_HOST } from "@shared/foundation/codeHost";
import type { GitHubReviewThread } from "@shared/github/types";
import type { GitHubBodyPlace } from "./githubLinks";

/** 行のスレッドへの返信と解決（返信・解決済みにするのは人） */
export interface ThreadActions {
  reply: (thread: GitHubReviewThread, body: string) => Promise<void>;
  resolve: (thread: GitHubReviewThread, resolved: boolean) => Promise<void>;
}

export interface GitHubDetailValue {
  /** ホスト・リポジトリ・プロジェクト（中身の URL から決める。既定は github.com で、画像はそのまま読む） */
  place: GitHubBodyPlace;
  /** 行のスレッドの返信と解決（PR の中身だけ。ないところでは出さない） */
  threadActions: ThreadActions | null;
  /** スレッドごとの「AI に渡す」（そのスレッドだけでレビューコメントで直す。PR の中身だけ） */
  handOffThread: ((thread: GitHubReviewThread) => void) | null;
}

const GitHubDetailContext = createContext<GitHubDetailValue>({ place: { host: GITHUB_DEFAULT_HOST, repo: null, projectId: null }, threadActions: null, handOffThread: null });

export const GitHubDetailProvider = GitHubDetailContext.Provider;
export const useGitHubDetailContext = () => useContext(GitHubDetailContext);
