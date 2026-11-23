import type { PullRequestInfo } from "@shared/git/types";
import { gitApi } from "@/features/git/ui/api";
import { request } from "@/foundation/ui/api/http";
import { workdirInput, workdirPath, type GitTarget } from "@/foundation/ui/api/workdir";

/**
 * 束ねの api（@/foundation/ui/api）から読む Git の口（ほかの機能の github・worktrees が読む分だけ。git の中は ui/api.ts の gitApi を呼ぶ）。
 * 束ねの api をなくすとき（P9 の前）に、読む側を口に替えて消す。PR の 2 つはまだ取り決めの外（P8-2d で github へ）
 */
export const gitShared = {
  gitStatus: (target: GitTarget) => gitApi("GET /api/projects/:projectId/git/status", workdirInput(target)),
  gitPull: (target: GitTarget) => gitApi("POST /api/projects/:projectId/git/pull", workdirInput(target)),
  /** 作業場所のブランチの PR（なければ null）と、PR を作る（まだプッシュしていなければ先にプッシュする） */
  pullRequest: (target: GitTarget) => request<PullRequestInfo | null>("GET", workdirPath(target, "/git/pr")),
  createPullRequest: (target: GitTarget) => request<PullRequestInfo>("POST", workdirPath(target, "/git/pr")),
};
