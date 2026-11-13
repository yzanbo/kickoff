import type { CiFailedLog, CiJobLog, CiRunDetail, CiRunList, CiRunWorktree } from "@shared/types";
import { request } from "./http";

/** CI の結果（GitHub Actions の実行・ログ・やり直し。コアの routes/ci.ts）。中身はいつも GitHub に聞き直したもの */
export const ciApi = {
  /** 実行の一覧（新しい 50 件）と、見張っているブランチの外の CI の成否 */
  ciRuns: (projectId: number) => request<CiRunList>("GET", `/api/projects/${projectId}/ci/runs`),
  /** 実行の中身（ジョブとステップ） */
  ciRun: (projectId: number, runId: number) => request<CiRunDetail>("GET", `/api/projects/${projectId}/ci/runs/${runId}`),
  /** ジョブのログ（ステップごと。動いている最中は available: false） */
  ciJobLog: (projectId: number, runId: number, jobId: number) => request<CiJobLog>("GET", `/api/projects/${projectId}/ci/runs/${runId}/jobs/${jobId}/log`),
  /** 失敗したステップのログ（「AI に渡す」の札の中身） */
  ciFailedLog: (projectId: number, runId: number) => request<CiFailedLog>("GET", `/api/projects/${projectId}/ci/runs/${runId}/failed-log`),
  /** やり直す（failed = 失敗したジョブだけ） */
  ciRerun: (projectId: number, runId: number, failed: boolean) => request<void>("POST", `/api/projects/${projectId}/ci/runs/${runId}/rerun`, { failed }),
  /** 「（ブランチ名）で直す」の作業場所（既定のブランチなら本体。なければワークツリーを作る） */
  ciRunWorktree: (projectId: number, runId: number) => request<CiRunWorktree>("POST", `/api/projects/${projectId}/ci/runs/${runId}/worktree`),
};
