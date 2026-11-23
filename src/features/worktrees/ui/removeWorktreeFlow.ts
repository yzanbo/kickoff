// ワークツリーを消す流れ（画面から消す所はどれもここを通る: 消す確認・WorktreeBar の「片付ける」・PR の知らせ・マージのあとの片付け）
import type { GitWorktree, WorktreeRemovalInfo } from "@shared/git/types";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { choose, confirm } from "@/foundation/ui/kit/ask";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { worktreeEnvOf } from "./envStore";
import { removalChecks } from "./worktreeEnvText";

/**
 * 消す前に知らせる注意（コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミット）。
 * deleteBranch: "ask" はブランチも消すかをこれから選ぶ確認（まだプッシュしていないブランチも知らせる）、false ならブランチを残すので
 * このブランチにしかないコミットの注意は出さない
 */
export function removalNotes(info: WorktreeRemovalInfo, { deleteBranch }: { deleteBranch: boolean | "ask" }): string[] {
  return [
    info.changes > 0 && `コミットしていない変更が ${info.changes} ファイルあります。ワークツリーを消すとなくなります。`,
    deleteBranch === "ask" && info.has_remote && info.branch && !info.pushed && "このブランチは、まだ GitHub にプッシュしていません。",
    info.has_remote && info.unpushed > 0 && `GitHub にプッシュしていないコミットが ${info.unpushed} 件あります。`,
    deleteBranch !== false && info.only_here > 0 && `このブランチにしかないコミットが ${info.only_here} 件あります。ブランチも消すと、これらのコミットもなくなります。`,
  ].filter((note): note is string => Boolean(note));
}

export interface RemoveWorktreeOptions {
  /** コミットしていない変更があっても消す（知らせたうえで消すとき） */
  force: boolean;
  deleteBranch: boolean;
  downVolumes: boolean;
  dropDbConnections: boolean;
  /** 消したあと本体を最新にする（PR がマージされたあとの片付け） */
  pullMain: boolean;
}

/**
 * ワークツリーを消し、作業場所の一覧を入れ直す。pullMain なら本体を最新にする（できなければ pullError に理由。消すのは済んでいる）。
 * 消すのに失敗したら投げる
 */
export async function removeWorktreeAndRefresh(
  projectId: number,
  path: string,
  { pullMain, ...opts }: RemoveWorktreeOptions,
): Promise<{ list: GitWorktree[]; pullError: string | null }> {
  const list = await api.removeWorktree(projectId, path, opts);
  worktreesStore.set(projectId, list);
  worktreesStore.invalidate(projectId);
  const pullError = pullMain ? await api.gitPull(projectId).then(() => null, (e: unknown) => errorMessage(e)) : null;
  return { list, pullError };
}

/**
 * ワークツリーを消す（確かめてから）。消す前に、コミットしていない変更・プッシュしていないコミット・このブランチにしかないコミットを調べて知らせ、
 * 「ワークツリーだけ消す（ブランチは残す）」か「ブランチも消す」かを選んでもらう。このブランチにしかないコミットがあるのにブランチも消すときは、もう一度確かめる。
 * Kickoff が組の名前を割り当てたワークツリー（ワークツリーの実行環境）なら「コンテナとデータも消す」、このワークツリーの DB から作った
 * DB クライアントの接続があれば「この接続も消す」を、選んだ状態で添える。
 * 消したら一覧を取り直し、消した後の一覧を返す（やめたら null）。失敗は投げる
 */
export async function confirmRemoveWorktree(projectId: number, worktree: Pick<GitWorktree, "path" | "branch">, label: string): Promise<GitWorktree[] | null> {
  const info = await api.worktreeRemovalInfo(projectId, worktree.path);
  const notes = removalNotes(info, { deleteBranch: "ask" }).map((note) => `・${note}`);
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
  const { list } = await removeWorktreeAndRefresh(projectId, worktree.path, { force: info.changes > 0, deleteBranch, ...read(picked.checked), pullMain: false });
  return list;
}
