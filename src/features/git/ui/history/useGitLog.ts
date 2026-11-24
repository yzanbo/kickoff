import { useEffect, useMemo, useState } from "react";
import type { GitCommit, GitRefs } from "@shared/git/types";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useWorktrees, worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { workplaceKey } from "@/foundation/ui/workplace/workplace";
import { layoutGraph } from "./commitGraph";
import { appendPage, readLogRange, sameLogStart } from "./gitLogPages";
import { gitApi } from "@/features/git/ui/api";
import { workdirInput } from "@/foundation/ui/api/workdir";

const NO_COMMITS: GitCommit[] = [];

/**
 * 履歴（すべてのブランチ）とグラフ。active（履歴を表示している）の間だけ読み、version が変わったら
 * （変更の一覧を取り直したら）読み込んだ範囲ごと読み直す。中身が同じなら描き直さない。「さらに読み込む」で続きを足す
 */
export function useGitLog(projectId: number, active: boolean, version: number) {
  // 履歴・ブランチは作業場所ごと（ワークツリーの一覧はプロジェクトで共通）
  const target = useWorkplace(projectId);
  const at = workplaceKey(target);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  // 読み込んだ範囲（コミットの数。作業場所ごと。0 = 1 ページ）
  const [range, setRange] = useState({ at, count: 0 });
  // ブランチ・リモート・タグ・stash（左の一覧）。取れなくても履歴は出す
  const refs = useQuery(at, () => gitApi("GET /api/projects/:projectId/git/refs", workdirInput(target)), { enabled: active, deps: [version, reload], same: sameJson });
  // 読み込んだところまで（初めは 1 ページ）を読み直す。先頭が同じなら描き直さない（読み込んだ続きも残す）
  const readPage = (skip: number) => gitApi("GET /api/projects/:projectId/git/log", workdirInput(target, { skip }));
  const log = useQuery(at, () => readLogRange(readPage, range.at === at ? range.count : 0), { enabled: active, deps: [version, reload], same: sameLogStart });
  // ワークツリー（プロジェクトで共通の一覧。作る・消すと取り直される）。見ている間は、古くなっていれば取り直す
  const worktrees = useWorktrees(projectId);
  useEffect(() => {
    if (active) worktreesStore.ensure(projectId);
  }, [projectId, active, version, reload]);
  const loaded = log.data?.commits.length ?? 0;

  // 続きを足す（読む間に取り直しが先に返って一覧が変わったら足さない）
  const loadMore = async () => {
    const base = log.data;
    if (!base) return;
    setLoadingMore(true);
    await readPage(loaded)
      .then((page) => {
        log.setData((prev) => appendPage(prev, base, page));
        setRange({ at, count: loaded + page.commits.length });
      })
      .finally(() => setLoadingMore(false));
  };

  // 失敗したときは空の一覧（読み込み中とは区別する）
  const commits = log.data?.commits ?? (log.error ? NO_COMMITS : undefined);
  const graph = useMemo(() => layoutGraph(commits ?? NO_COMMITS), [commits]);
  return { worktrees, refs: refs.data, commits, more: Boolean(log.data?.more), error: errorText(log.error), graph, loadMore, loadingMore, refresh: () => setReload((n) => n + 1) };
}

const sameJson = (a: GitRefs, b: GitRefs) => JSON.stringify(a) === JSON.stringify(b);

export type GitLogController = ReturnType<typeof useGitLog>;
