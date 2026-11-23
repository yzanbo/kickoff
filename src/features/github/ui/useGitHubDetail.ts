import type { GitHubIssueDetail, GitHubKind, GitHubPullDetail } from "@shared/github/types";
import { api } from "@/foundation/ui/api";
import { errorText, useQuery } from "@/foundation/ui/query";
import { githubRefresh } from "./githubRefresh";

export type GitHubDetail = GitHubIssueDetail | GitHubPullDetail;

/**
 * 開いている issue・PR の中身。開いたとき・取り直しのボタン・窓に戻った・1 分ごとに GitHub に聞く。
 * 同じものを取り直している間・失敗しても前の中身を出し（「更新中」の印）、別のものに移ったら読み込み中に戻す。
 * 移ったときは、コアが最後に取った中身（10 分まで）があれば、GitHub の答えが届くまでそれを出す
 */
export function useGitHubDetail(projectId: number, kind: GitHubKind, number: number) {
  const detail = useQuery<GitHubDetail>(["github.detail", projectId, kind, number], () => (kind === "pr" ? api.githubPull(projectId, number) : api.githubIssue(projectId, number)), {
    keepPrevious: true,
    ...githubRefresh(),
    seed: () => api.githubCachedDetail(projectId, kind, number),
  });
  // 前のものの中身・失敗は出さない（keepPrevious は、同じものの取り直しが失敗しても中身を残すため）
  if (detail.stale) return { data: null, error: null, loading: true, refresh: detail.reload };
  return { data: detail.data ?? null, error: errorText(detail.error) ?? null, loading: detail.loading, refresh: detail.reload };
}
