// ワークツリーの帯の PR を読む・作る口（拡張点 worktreePullRequests。ルートの持ち主の github が 1 つだけ登録する）
import type { PullRequestInfo } from "@shared/git/types";
import type { GitTarget } from "@/foundation/ui/api/workdir";
import { definePoint } from "@/foundation/ui/points";

export interface WorktreePullRequestSource {
  /** 作業場所のブランチの PR（なければ null） */
  get(target: GitTarget): Promise<PullRequestInfo | null>;
  /** 作業場所のブランチの PR を作る */
  create(target: GitTarget): Promise<PullRequestInfo>;
}

export const worktreePullRequests = definePoint<WorktreePullRequestSource>("worktreePullRequests");

const missing = () => Promise.reject(new Error("PR の口（worktreePullRequests）が登録されていない"));
const NO_SOURCE: WorktreePullRequestSource = { get: missing, create: missing };

/** 登録された口（登録がなければ、どれも失敗を返す口） */
export const pullRequestSource = (): WorktreePullRequestSource => worktreePullRequests.items()[0] ?? NO_SOURCE;
