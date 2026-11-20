import { useState } from "react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/git/ui/storage";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { useExternalTerminal } from "@/foundation/ui/external/externalApps";
import type { GitStatusController } from "@/features/git/ui/useGitStatus";
import type { WorktreeActions } from "@/features/worktrees/ui/useWorktreeActions";
import type { BranchActions } from "./useBranchActions";
import type { GitLogController } from "./useGitLog";
import type { StashActions } from "./useStashActions";
import { canOpenExternal, openExternal } from "@/foundation/ui/external/native";

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
  const [listHidden, setListHidden] = useSetting(storage.settings.historyListHidden);
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
    /** フェッチの途中（押した分と、開いた・窓に戻ったときの自動の分。帯のボタンに回る印） */
    fetching: fetching || git.autoFetching,
    busy: branch.busy ?? (fetching ? "フェッチ" : null),
    branches: log.refs?.branches ?? [],
    listHidden,
    toggleList: () => setListHidden(!listHidden),
    /** リモートの情報を取ってくる（作業場所は変えない） */
    fetch: async () => {
      if (fetching) return;
      setFetching(true);
      await git
        .fetchRemote()
        .then(() => log.refresh())
        .finally(() => setFetching(false));
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
    canOpenOutside: canOpenExternal() && Boolean(folder),
    openFinder: () => folder && void openExternal({ kind: "path", path: folder }),
    openVSCode: () => folder && void openExternal({ kind: "vscode", path: folder }),
    openTerminal: () => folder && terminal.open(folder),
    terminalLabel: terminal.label,
  };
}

export type HistoryOps = ReturnType<typeof useHistoryOps>;
