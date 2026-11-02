import { useEffect, useMemo, useState } from "react";
import type { GitCommit, GitRefs, GitWorktree } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { layoutGraph } from "./commitGraph";
import { useGitTarget } from "../../worktree/worktreeContext";

/**
 * 履歴（すべてのブランチ）とグラフ。active（履歴を表示している）の間だけ読み、version が変わったら
 * （変更の一覧を取り直したら）読み直す。中身が同じなら描き直さない。「さらに読み込む」で続きを足す
 */
export function useGitLog(projectId: number, active: boolean, version: number) {
  // 履歴・ブランチは作業場所ごと（ワークツリーの一覧はプロジェクトで共通）
  const { target, key: at } = useGitTarget(projectId);
  const [state, setState] = useState<{ at: string; commits: GitCommit[]; more: boolean; error?: string }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  // ブランチ・リモート・タグ・stash（左の一覧）
  const [refs, setRefs] = useState<{ at: string; value: GitRefs }>();
  // ワークツリー（作る・消すと、その結果で置き換える）
  const [worktrees, setWorktrees] = useState<{ projectId: number; value: GitWorktree[] }>();
  const loaded = state?.at === at ? state.commits.length : 0;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    api.gitRefs(target).then(
      (value) => alive && setRefs((prev) => (prev?.at === at && JSON.stringify(prev.value) === JSON.stringify(value) ? prev : { at, value })),
      () => undefined,
    );
    api.gitWorktrees(projectId).then(
      (value) => alive && setWorktrees({ projectId, value }),
      () => undefined,
    );
    // 読み込んだところまで（初めは 1 ページ）を読み直す
    api.gitLog(target).then(
      (log) =>
        alive &&
        setState((prev) => {
          const same = prev?.at === at && prev.commits.slice(0, log.commits.length).map(key).join() === log.commits.map(key).join();
          return same ? prev : { at, commits: log.commits, more: log.more };
        }),
      (e: unknown) => alive && setState({ at, commits: [], more: false, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, active, version, reload]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const log = await api.gitLog(target, loaded);
      setState((prev) => (prev?.at === at ? { ...prev, commits: [...prev.commits, ...log.commits], more: log.more } : prev));
    } finally {
      setLoadingMore(false);
    }
  };

  const current = state?.at === at ? state : undefined;
  const graph = useMemo(() => layoutGraph(current?.commits ?? []), [current?.commits]);
  return {
    worktrees: worktrees?.projectId === projectId ? worktrees.value : undefined,
    setWorktrees: (value: GitWorktree[]) => setWorktrees({ projectId, value }),
    refs: refs?.at === at ? refs.value : undefined, commits: current?.commits, more: Boolean(current?.more), error: current?.error, graph, loadMore, loadingMore, refresh: () => setReload((n) => n + 1) };
}

/** 描き直しが要るかを比べるための、コミットとその印 */
const key = (c: GitCommit) => `${c.hash}:${c.refs.join("|")}`;

export type GitLogController = ReturnType<typeof useGitLog>;
