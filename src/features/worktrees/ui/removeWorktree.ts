import type { GitWorktree } from "@shared/git/types";
import { api } from "@/foundation/ui/api";
import { choose, confirm } from "@/foundation/ui/kit/ask";
import { worktreeEnvOf, worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { removalChecks } from "./worktreeEnvText";

/**
 * ワークツリーを消す（確かめてから）。消す前に、コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミットを調べて知らせ、
 * 「ワークツリーだけ消す（ブランチは残す）」か「ブランチも消す」かを選んでもらう。このブランチにしかないコミットがあるのにブランチも消すときは、もう一度確かめる。
 * Kickoff が組の名前を割り当てたワークツリー（ワークツリーの実行環境）なら「コンテナとデータも消す」、このワークツリーの DB から作った
 * DB クライアントの接続があれば「この接続も消す」を、選んだ状態で添える。
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
  const choices: { value: "keep" | "both"; label: string; primary: boolean }[] = info.branch
    ? [
        { value: "keep", label: "ワークツリーだけ消す", primary: !safeToDeleteBranch },
        { value: "both", label: "ブランチも消す", primary: safeToDeleteBranch },
      ]
    : [{ value: "keep", label: "消す", primary: true }];
  const title = `ワークツリー「${label}」を消しますか？`;
  const { checks, read } = removalChecks(worktreeEnvOf(projectId, worktree.path), info.db_connections);
  const picked = checks.length
    ? await choose({ title, message, choices, checks })
    : await choose({ title, message, choices }).then((r) => r?.value ?? null).then((value) => value && { value, checked: [] });
  if (!picked) return null;
  const choice = picked.value;
  const deleteBranch = choice === "both";
  if (deleteBranch && info.only_here > 0) {
    const ok = await confirm({
      title: `ブランチ「${info.branch}」も消しますか？`,
      message: `このブランチにしかないコミットが ${info.only_here} 件あります。ブランチを消すと、これらのコミットは元に戻せません。`,
      confirmLabel: "コミットごと消す",
      danger: true,
    });
    if (!ok) return null;
  }
  // コミットしていない変更は、上で知らせたうえで消すので force で消す
  const list = await api.removeWorktree(projectId, worktree.path, { force: info.changes > 0, deleteBranch, ...read(picked.checked) });
  worktreesStore.set(projectId, list);
  worktreesStore.invalidate(projectId);
  return list;
}
