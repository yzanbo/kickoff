import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubIssueDetail, GitHubKind, GitHubPullDetail } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { useGitHubRefresh } from "./useGitHubRefresh";

export type GitHubDetail = GitHubIssueDetail | GitHubPullDetail;

/**
 * 開いている issue・PR の中身。開いたとき・取り直しのボタン・窓に戻った・1 分ごとに GitHub に聞く。
 * 同じものを取り直している間は前の中身を出し（「更新中」の印）、別のものに移ったら読み込み中に戻す。
 * 移ったときは、コアが最後に取った中身（10 分まで）があれば、GitHub の答えが届くまでそれを出す（仕様書 12 のつなぎの表示）
 */
export function useGitHubDetail(projectId: number, kind: GitHubKind, number: number, active: boolean) {
  const key = `${projectId}:${kind}:${number}`;
  const [state, setState] = useState<{ key: string; data: GitHubDetail | null; error: string | null; loading: boolean }>({ key, data: null, error: null, loading: true });
  const seq = useRef(0);
  const loadedKey = useRef<string | null>(null);

  const load = useCallback(() => {
    const id = ++seq.current;
    const moved = loadedKey.current !== key;
    loadedKey.current = key;
    setState((s) => (s.key === key ? { ...s, loading: true } : { key, data: null, error: null, loading: true }));
    // 覚えた中身は、まだ何も出していない同じもののときだけ使う（頼みの番号では見ない。続けて取り直しが走っても、GitHub の答えが届くまでのつなぎに出す）
    if (moved)
      api.githubCachedDetail(projectId, kind, number).then(
        (cached) => cached && setState((s) => (s.key === key && !s.data ? { ...s, data: cached } : s)),
        () => undefined,
      );
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
