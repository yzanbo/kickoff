import { useState } from "react";
import { useSetting } from "@/hooks/useSetting";
import { HISTORY_LIST_HIDDEN } from "@/lib/storageKeys";
import { useProjects } from "@/stores/projects";
import { useExternalTerminal } from "@/features/openWith/externalApps";
import type { GitStatusController } from "@/features/editor/useGitStatus";
import type { WorktreeActions } from "@/features/worktree/useWorktreeActions";
import type { BranchActions } from "./useBranchActions";
import type { GitLogController } from "./useGitLog";
import type { StashActions } from "./useStashActions";

/**
 * 履歴タブの上の帯と Git の操作の窓で共有する操作（一覧の開閉・フェッチ・プル・プッシュ・退避・ブランチ・外で開く）。
 * プル・プッシュはいまのブランチに対するブランチの操作（確かめ・衝突の扱いも同じ）。外で開くのは見ている作業場所のフォルダ
 */
export function useHistoryOps({
  projectId,
  worktree,
  git,
  log,
  branch,
  stash,
  worktreeActions,
}: {
  projectId: number;
  /** 見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
  worktree?: string;
  git: GitStatusController;
  log: GitLogController;
  branch: BranchActions;
  stash: StashActions;
  worktreeActions: WorktreeActions;
}) {
  const [listHidden, setListHidden] = useSetting(HISTORY_LIST_HIDDEN);
  const [fetching, setFetching] = useState(false);
  const { projectsById } = useProjects();
  const terminal = useExternalTerminal();
  const status = git.status?.repo ? git.status : undefined;
  const current = branch.current;
  const upstream = status?.upstream ?? null;
  const folder = worktree ?? projectsById.get(projectId)?.repo_path ?? null;
  const latestStash = stash.stashes[0]?.ref;
  // ブランチから外れているときは、プル・プッシュ・ブランチの切り替えの「いま」がない
  const noBranch = current === null ? "ブランチから外れています" : null;

  return {
    current,
    upstream,
    ahead: status?.ahead ?? 0,
    behind: status?.behind ?? 0,
    folder,
    fetching,
    busy: branch.busy ?? (fetching ? "フェッチ" : null),
    branches: log.refs?.branches ?? [],
    listHidden,
    toggleList: () => setListHidden(!listHidden),
    /** リモートの情報を取ってくる（作業場所は変えない） */
    fetch: async () => {
      if (fetching) return;
      setFetching(true);
      try {
        await git.fetchRemote();
        log.refresh();
      } finally {
        setFetching(false);
      }
    },
    /** プルできない理由（できれば null） */
    pullBlocked: noBranch ?? (upstream ? null : "追いかけているリモートのブランチがありません"),
    pull: () => current && branch.pull(current),
    pushBlocked: noBranch ?? (status?.has_origin || upstream ? null : "プッシュ先のリモート（origin）がありません"),
    push: () => current && branch.push(current),
    stashSave: stash.save,
    /** 最新の退避を戻す・適用する（なければ知らせる） */
    stashPopLatest: () => (latestStash ? stash.pop(latestStash) : stash.none()),
    stashApplyLatest: () => (latestStash ? stash.apply(latestStash) : stash.none()),
    hasStash: Boolean(latestStash),
    /** いまのコミット（HEAD）から新しいブランチ・タグ */
    newBranch: () => branch.createBranch("HEAD", current ?? "いまのコミット"),
    newTag: () => branch.createTag("HEAD", current ?? "いまのコミット"),
    newWorktree: () => void worktreeActions.createWorktree(),
    checkout: branch.checkout,
    merge: branch.merge,
    rebase: branch.rebase,
    /** 見ている作業場所を外のアプリで開く（Mac のアプリだけ） */
    canOpenOutside: Boolean(window.kickoff && folder),
    openFinder: () => folder && void window.kickoff?.externalApps.openPath(folder),
    openVSCode: () => folder && void window.kickoff?.externalApps.openInVSCode(folder),
    openTerminal: () => folder && terminal.open(folder),
    terminalLabel: terminal.label,
  };
}

export type HistoryOps = ReturnType<typeof useHistoryOps>;
