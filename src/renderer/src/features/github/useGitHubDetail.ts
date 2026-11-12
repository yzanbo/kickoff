import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubIssueDetail, GitHubKind, GitHubPullDetail } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { useGitHubRefresh } from "./useGitHubRefresh";

export type GitHubDetail = GitHubIssueDetail | GitHubPullDetail;

/**
 * 開いている issue・PR の中身。開いたとき・取り直しのボタン・窓に戻った・1 分ごとに GitHub に聞く。
 * 同じものを取り直している間は前の中身を出し（「更新中」の印）、別のものに移ったら読み込み中に戻す
 */
export function useGitHubDetail(projectId: number, kind: GitHubKind, number: number, active: boolean) {
  const key = `${projectId}:${kind}:${number}`;
  const [state, setState] = useState<{ key: string; data: GitHubDetail | null; error: string | null; loading: boolean }>({ key, data: null, error: null, loading: true });
  const seq = useRef(0);

  const load = useCallback(() => {
    const id = ++seq.current;
    setState((s) => (s.key === key ? { ...s, loading: true } : { key, data: null, error: null, loading: true }));
    (kind === "pr" ? api.githubPull(projectId, number) : api.githubIssue(projectId, number)).then(
      (data) => id === seq.current && setState({ key, data, error: null, loading: false }),
      (e: unknown) => id === seq.current && setState((s) => ({ ...s, key, error: errorMessage(e), loading: false })),
    );
  }, [key, kind, number, projectId]);

  useEffect(() => {
    if (active) load();
  }, [load, active]);
  useGitHubRefresh(load, active);

  const current = state.key === key ? state : { key, data: null, error: null, loading: true };
  return { ...current, refresh: load };
}
