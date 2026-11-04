import type { GitWorktree } from "@shared/types";
import { api } from "@/api";
import { choiceDialog, confirmDialog } from "@/ui/dialogs";
import { worktreesStore } from "@/stores/worktrees";

/**
 * ワークツリーを消す（確かめてから）。消す前に、コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミットを調べて知らせ、
 * 「ワークツリーだけ消す（ブランチは残す）」か「ブランチも消す」かを選んでもらう。このブランチにしかないコミットがあるのにブランチも消すときは、もう一度確かめる。
 * 消したら一覧を取り直し、消した後の一覧を返す（やめたら null）。失敗は投げる
 */
export async function confirmRemoveWorktree(projectId: number, worktree: Pick<GitWorktree, "path" | "branch">, label: string): Promise<GitWorktree[] | null> {
  const info = await api.worktreeRemovalInfo(projectId, worktree.path);
  const notes = [
    info.changes > 0 && `・コミットしていない変更が ${info.changes} ファイルあります。消すとなくなります。`,
    info.has_remote && info.branch && !info.pushed && "・このブランチは、まだ GitHub にプッシュしていません。",
    info.has_remote && info.unpushed > 0 && `・GitHub にプッシュしていないコミットが ${info.unpushed} 件あります。`,
    info.only_here > 0 && `・このブランチにしかないコミットが ${info.only_here} 件あります。ブランチも消すと、これらのコミットもなくなります。`,
  ].filter((note): note is string => Boolean(note));
  const message = [
    `${worktree.path} のフォルダを消します。ここで作業していたチャットは、続きを本体で進めます。`,
    ...(info.branch ? [`ブランチ「${info.branch}」は、「ブランチも消す」を選ばなければ残ります。`] : []),
    ...(notes.length > 0 ? ["", "注意:", ...notes] : []),
  ].join("\n");
  // ブランチを消しても失うものがなければ「ブランチも消す」、あれば「ワークツリーだけ消す」をすすめる
  const safeToDeleteBranch = info.only_here === 0 && info.unpushed === 0;
  const choice = await choiceDialog({
    title: `ワークツリー「${label}」を消しますか？`,
    message,
    choices: info.branch
      ? [
          { value: "keep", label: "ワークツリーだけ消す", primary: !safeToDeleteBranch },
          { value: "both", label: "ブランチも消す", primary: safeToDeleteBranch },
        ]
      : [{ value: "keep", label: "消す", primary: true }],
  });
  if (!choice) return null;
  const deleteBranch = choice === "both";
  if (deleteBranch && info.only_here > 0) {
    const ok = await confirmDialog({
      title: `ブランチ「${info.branch}」も消しますか？`,
      message: `このブランチにしかないコミットが ${info.only_here} 件あります。ブランチを消すと、これらのコミットは元に戻せません。`,
      confirmLabel: "コミットごと消す",
      danger: true,
    });
    if (!ok) return null;
  }
  // コミットしていない変更は、上で知らせたうえで消すので force で消す
  const list = await api.removeWorktree(projectId, worktree.path, info.changes > 0, deleteBranch);
  worktreesStore.set(projectId, list);
  worktreesStore.invalidate(projectId);
  return list;
}
