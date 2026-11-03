import type { GitWorktree } from "../../../../core/types";
import { api } from "../../api";
import { promptDialog } from "../../dialogs";
import { baseName } from "../../format";
import { useActionError } from "../../hooks/useActionError";
import { invalidateWorktrees, setWorktreeList } from "../../worktree/worktreeBranches";
import { worktreeLabel } from "../../worktree/WorktreePicker";
import { confirmRemoveWorktree } from "../../worktree/removeWorktree";
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

  // ワークツリーを消す（消す前に変更・プッシュしていないコミットを知らせ、ブランチも消すかを選んでもらう）
  const removeWorktree = (w: GitWorktree) =>
    worktreeError.guard(async () => {
      if (await confirmRemoveWorktree(projectId, w, worktreeLabel(w))) log.refresh();
    });

  return { error: worktreeError.error, createWorktree, removeWorktree };
}
