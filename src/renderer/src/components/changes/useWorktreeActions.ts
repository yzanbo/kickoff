import type { GitWorktree } from "../../../../core/types";
import { api } from "../../api";
import { confirmDialog, promptDialog } from "../../dialogs";
import { errorMessage } from "../../errors";
import { baseName } from "../../format";
import { useActionError } from "../../hooks/useActionError";
import { invalidateWorktrees, setWorktreeList } from "../../worktree/worktreeBranches";
import { worktreeLabel } from "../../worktree/WorktreePicker";
import type { GitLogController } from "./useGitLog";

/** 履歴の左の一覧のワークツリーの操作（作る・消す）。失敗の文は error に出す */
export function useWorktreeActions(projectId: number, log: GitLogController) {
  const worktreeError = useActionError();
  const repoName = log.worktrees?.[0] ? baseName(log.worktrees[0].path) : "";

  // ワークツリーを作る（ブランチの名前を聞く。なければいまのコミットから作る）
  const createWorktree = async () => {
    const branch = await promptDialog({
      title: "ワークツリーを作る",
      message: `いまのコミットから新しいブランチを作り、リポジトリの隣の「${repoName}-worktrees」フォルダに取り出します。いまあるブランチの名前なら、そのブランチを取り出します。`,
      label: "ブランチの名前",
      placeholder: "例: feature/login",
      confirmLabel: "作る",
    });
    if (!branch) return;
    await worktreeError.guard(async () => {
      setWorktreeList(projectId, await api.addWorktree(projectId, branch));
      invalidateWorktrees(projectId);
      log.refresh();
    });
  };

  // ワークツリーを消す（フォルダを消す。ブランチは残す。変更が残っていれば、もう一度確かめる）
  const removeWorktree = async (w: GitWorktree) => {
    const name = worktreeLabel(w);
    if (
      !(await confirmDialog({
        title: `ワークツリー「${name}」を消しますか？`,
        message: `${w.path} のフォルダを消します。ブランチは残ります。ここで作業していたチャットは、続きを本体で進めます。`,
        confirmLabel: "消す",
        danger: true,
      }))
    )
      return;
    try {
      setWorktreeList(projectId, await api.removeWorktree(projectId, w.path));
      invalidateWorktrees(projectId);
      worktreeError.setError(undefined);
    } catch (e) {
      if (!errorMessage(e).includes("--force")) return worktreeError.setError(errorMessage(e));
      const force = await confirmDialog({
        title: "コミットしていない変更があります",
        message: "消すと、そのワークツリーの変更はなくなります。それでも消しますか？",
        confirmLabel: "変更ごと消す",
        danger: true,
      });
      if (force)
        await worktreeError.guard(async () => {
          setWorktreeList(projectId, await api.removeWorktree(projectId, w.path, true));
          invalidateWorktrees(projectId);
        });
    }
  };

  return { error: worktreeError.error, createWorktree, removeWorktree };
}
