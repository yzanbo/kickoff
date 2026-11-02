import { useEffect, useMemo, useState } from "react";
import type { GitCommit, GitLog, GitRefs } from "../../../../core/types";
import { api } from "../../api";
import { useKeyedAsync } from "../../hooks/useKeyedAsync";
import { refreshWorktrees, useWorktreeList } from "../../worktree/worktreeBranches";
import { useGitTarget } from "../../worktree/worktreeContext";
import { layoutGraph } from "./commitGraph";

const NO_COMMITS: GitCommit[] = [];

/**
 * 履歴（すべてのブランチ）とグラフ。active（履歴を表示している）の間だけ読み、version が変わったら
 * （変更の一覧を取り直したら）読み直す。中身が同じなら描き直さない。「さらに読み込む」で続きを足す
 */
export function useGitLog(projectId: number, active: boolean, version: number) {
  // 履歴・ブランチは作業場所ごと（ワークツリーの一覧はプロジェクトで共通）
  const { target, key: at } = useGitTarget(projectId);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  // ブランチ・リモート・タグ・stash（左の一覧）。取れなくても履歴は出す
  const refs = useKeyedAsync(at, () => api.gitRefs(target), { active, deps: [version, reload], same: sameJson });
  // 読み込んだところまで（初めは 1 ページ）を読み直す。先頭のページが同じなら描き直さない（読み込んだ続きも残す）
  const log = useKeyedAsync(at, () => api.gitLog(target), { active, deps: [version, reload], same: sameFirstPage });
  // ワークツリー（プロジェクトで共通の一覧。作る・消すと invalidateWorktrees で取り直される）。見ている間は時々取り直す
  const worktrees = useWorktreeList(projectId);
  useEffect(() => {
    if (active) refreshWorktrees(projectId);
  }, [projectId, active, version, reload]);
  const loaded = log.data?.commits.length ?? 0;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await api.gitLog(target, loaded);
      log.setData((prev) => ({ ...prev, commits: [...prev.commits, ...page.commits], more: page.more }));
    } finally {
      setLoadingMore(false);
    }
  };

  // 失敗したときは空の一覧（読み込み中とは区別する）
  const commits = log.data?.commits ?? (log.error ? NO_COMMITS : undefined);
  const graph = useMemo(() => layoutGraph(commits ?? NO_COMMITS), [commits]);
  return { worktrees, refs: refs.data, commits, more: Boolean(log.data?.more), error: log.error, graph, loadMore, loadingMore, refresh: () => setReload((n) => n + 1) };
}

const sameJson = (a: GitRefs, b: GitRefs) => JSON.stringify(a) === JSON.stringify(b);

/** 描き直しが要るかを比べるための、コミットとその印 */
const key = (c: GitCommit) => `${c.hash}:${c.refs.join("|")}`;
/** 先頭のページ（取り直した分）が同じなら、前の一覧のまま */
const sameFirstPage = (prev: GitLog, next: GitLog) => prev.commits.slice(0, next.commits.length).map(key).join() === next.commits.map(key).join();

export type GitLogController = ReturnType<typeof useGitLog>;
