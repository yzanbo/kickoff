import { useState } from "react";
import type { GitBranchAction, GitBranchActionResult, GitOperation, GitRefs } from "@shared/git/types";
import { GIT_OPERATION_LABELS } from "@shared/git/labels";
import { errorMessage } from "@shared/foundation/errors";
import { navigate } from "@/foundation/ui/navigation/router";
import { worktreesStore, worktreeSource } from "@/foundation/ui/workplace/worktreesStore";
import { alert, choose, confirm, prompt } from "@/foundation/ui/kit/ask";
import { countBusyAt } from "@/foundation/ui/workplace/workplace";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import type { GitStatusController } from "@/features/git/ui/useGitStatus";
import type { GitLogController } from "./useGitLog";
import { gitApi } from "@/features/git/ui/api";
import { workdirInput } from "@/foundation/ui/api/workdir";
import type { BranchMenuItem } from "./branchMenuItems";
import { BRANCH_ACTION_UI, fileList, type BranchActionContext, type PreparedBranchAction } from "./branchActionUi";
import { useChats } from "@/features/chat/ui";

/**
 * 履歴の右クリックのブランチ・タグの操作（チェックアウト・プッシュ・マージなど）。確かめ・入力は表 BRANCH_ACTION_UI（perform で引く）、
 * 終わったら Git の状態と履歴を取り直す。マージ・リベース・プルで衝突したら、変更タブで解くか取りやめるかを選んでもらう。busy は実行中の操作の名前（見出しに出す）
 */
export function useBranchActions(projectId: number, log: GitLogController, git: GitStatusController, onWorktreeChange: (worktree: string | undefined) => void) {
  const target = useWorkplace(projectId);
  const { chats } = useChats({ projectId });
  const [busy, setBusy] = useState<string | null>(null);
  const refs: GitRefs | undefined = log.refs;
  const status = git.status?.repo ? git.status : undefined;
  const current = status?.branch ?? null;
  // この作業場所で作業中のチャット（チェックアウト・マージでファイルが入れ替わると、作業がぶつかる）
  const busyChats = countBusyAt(chats, target.worktree);
  const dirty = Boolean(status && status.staged.length + status.unstaged.length + status.conflicts.length > 0);
  const ctx: BranchActionContext = {
    current,
    refs,
    busyChats,
    filesWarning: () => [
      ...(busyChats > 0 ? [`この作業場所では ${busyChats} 件のチャットが作業中です。ファイルが入れ替わると、作業がぶつかります。`] : []),
      ...(dirty ? ["コミットしていない変更は、そのまま持っていきます（ぶつかるときは git が取りやめます）。"] : []),
    ],
    mergePreview: (branch) => gitApi("GET /api/projects/:projectId/git/merge-preview", workdirInput(target, { branch })),
  };

  /** 衝突して止まったとき: 変更タブで解くか、取りやめて元に戻すかを選んでもらう */
  const handleConflicts = async (conflicts: string[], operation: GitOperation) => {
    const label = GIT_OPERATION_LABELS[operation];
    const picked = await choose({
      title: `${label}で衝突しました（${conflicts.length} 件）`,
      message: `${fileList(conflicts)}\n\n変更タブで衝突したファイルを直し（こちらの版・取り込む側の版を選ぶこともできます）、解決済みにしてから「続ける」を押してください。取りやめると、${label}の前の状態に戻ります。`,
      choices: [
        { value: "abort", label: "取りやめる" },
        { value: "resolve", label: "変更タブで解決する", primary: true },
      ],
    }).then((r) => r?.value ?? null);
    if (picked === "abort") {
      await git.operate("abort").catch((e: unknown) => alert("取りやめられませんでした", errorMessage(e)));
      log.refresh();
    } else if (picked === "resolve") {
      navigate({ name: "project", id: projectId, tab: "changes" });
    }
  };

  /** 操作を送り、Git の状態と履歴を取り直し、衝突したら選んでもらう（失敗は投げる） */
  const sendAction = async (body: GitBranchAction, onConflicts?: (conflicts: string[]) => Promise<void>): Promise<GitBranchActionResult> => {
    // プル・プッシュなどはリモートの参照も書き換えるので、自動のフェッチの途中なら終わるのを待つ
    const result = await gitApi("POST /api/projects/:projectId/git/branch-action", { ...workdirInput(target), body });
    git.applyStatus(result.status);
    log.refresh();
    const stopped = result.status.repo ? result.status.operation : null;
    if (result.conflicts.length > 0) {
      if (onConflicts) await onConflicts(result.conflicts);
      else await handleConflicts(result.conflicts, stopped ?? BRANCH_ACTION_UI[body.action].operation ?? "merge");
    }
    return result;
  };

  /**
   * 操作を 1 つ送る（実行中の名前は表の label。失敗はダイアログで知らせる）。途中の操作にならない衝突（退避を戻したときなど）は、onConflicts で知らせる
   */
  const run = async (body: GitBranchAction, onConflicts?: (conflicts: string[]) => Promise<void>): Promise<GitBranchActionResult | null> => {
    const name = BRANCH_ACTION_UI[body.action].label;
    setBusy(name);
    const result = await sendAction(body, onConflicts).catch(async (e: unknown) => {
      await alert(`${name}できませんでした`, errorMessage(e));
      return null;
    });
    setBusy(null);
    return result;
  };

  /** 表の確かめ・入力をしてから送る（name は操作の相手、label はその見せ方） */
  const perform = async (kind: PreparedBranchAction, name: string, label = name) => {
    const body = await BRANCH_ACTION_UI[kind].prepare(ctx, name, label);
    if (!body) return;
    await run(body);
  };

  /** ほかの機能が足した項目（branchMenuItems）を、確かめてから送る（実行中の名前・失敗の知らせ・取り直しは表の操作と同じ） */
  const performItem = async (item: BranchMenuItem, branch: string) => {
    if (!(await item.confirm(branch))) return;
    setBusy(item.busyLabel);
    const notice = await item.send(target, branch).then(
      (n) => ({ ok: true as const, n }),
      async (e: unknown) => {
        await alert(`${item.busyLabel}できませんでした`, errorMessage(e));
        return { ok: false as const, n: null };
      },
    );
    if (notice.ok) {
      await git.refresh();
      log.refresh();
    }
    setBusy(null);
    if (notice.n) await alert(notice.n.title, notice.n.message);
  };

  /** ブランチをワークツリーとして取り出し、作ったら見ている作業場所をそこへ切り替えるか聞く（失敗は投げる） */
  const addBranchWorktree = async (branch: string) => {
    const list = await worktreeSource().add(projectId, branch);
    worktreesStore.set(projectId, list);
    worktreesStore.invalidate(projectId);
    log.refresh();
    const made = list.find((w) => w.branch === branch);
    if (made && (await confirm({ title: "ワークツリーを作りました", message: made.path, confirmLabel: "この作業場所に切り替える" }))) onWorktreeChange(made.path);
  };

  /** ブランチを消す（マージしていなければ確かめ直して強制で消す。やめたら何もしない。失敗は投げる） */
  const deleteLocalBranch = async (branch: string, remote: boolean) => {
    const request = (force: boolean) => gitApi("POST /api/projects/:projectId/git/branch-action", { ...workdirInput(target), body: { action: "delete_branch", branch, force, remote } });
    const result = await request(false).catch(async (e: unknown) => {
      // マージしていないコミットがあると -d では消せないので、消えてもよいか確かめ直す
      if (!/not fully merged/.test(errorMessage(e))) throw e;
      const force = await confirm({
        title: `「${branch}」はマージしていません`,
        message: "ほかのブランチに入っていないコミットがあります。消すと、そのコミットはたどれなくなります。",
        confirmLabel: "それでも削除",
        danger: true,
      });
      return force ? request(true) : null;
    });
    if (!result) return;
    git.applyStatus(result.status);
    log.refresh();
  };

  return {
    busy,
    current,
    /** 操作を 1 つ送る（退避の操作 useStashActions も使う） */
    run,
    perform,
    performItem,
    remotes: refs?.remotes ?? [],
    /** リモートのブランチをチェックアウト（追いかける手元のブランチを作る。もう追いかけているブランチがあれば、それをチェックアウト） */
    checkoutRemote: async (remoteBranch: string, remote: string) => {
      const tracking = refs?.branches.find((b) => b.upstream === remoteBranch);
      if (tracking) {
        if (!tracking.current) await perform("checkout", tracking.name);
        return;
      }
      const name = await prompt({
        title: `「${remoteBranch}」をチェックアウト`,
        message: [`「${remoteBranch}」を追いかける手元のブランチを作って、チェックアウトします。`, ...ctx.filesWarning()].join("\n\n"),
        label: "手元のブランチの名前",
        initial: remoteBranch.slice(remote.length + 1),
        confirmLabel: "チェックアウト",
      }).then((r) => r?.value ?? null);
      if (name) await run({ action: "checkout_remote", remote_branch: remoteBranch, name });
    },
    /** ブランチをワークツリーとして取り出す（作ったら、見ている作業場所をそこへ切り替えるか聞く） */
    checkoutAsWorktree: async (branch: string) => {
      setBusy("ワークツリーの作成");
      await addBranchWorktree(branch).catch((e: unknown) => alert("ワークツリーを作れませんでした", errorMessage(e)));
      setBusy(null);
    },
    setUpstream: (branch: string, upstream: string | null) => run({ action: "set_upstream", branch, upstream }),
    /** ブランチを消す（リモートのブランチも消すかを選ぶ。マージしていなければ、強制で消すか確かめ直す） */
    deleteBranch: async (branch: string) => {
      const upstream = refs?.branches.find((b) => b.name === branch)?.upstream;
      const picked = upstream
        ? await confirm({ title: `「${branch}」を削除`, message: "手元のブランチを消します。", confirmLabel: "削除", danger: true, checks: [{ label: `リモートのブランチ「${upstream}」も消す`, initial: false }] }).then((r) => r && { checked: r.checked[0] })
        : (await confirm({ title: `「${branch}」を削除`, message: "手元のブランチを消します。", confirmLabel: "削除", danger: true }))
          ? { checked: false }
          : null;
      if (!picked) return;
      setBusy(BRANCH_ACTION_UI.delete_branch.label);
      await deleteLocalBranch(branch, picked.checked).catch((e: unknown) => alert("削除できませんでした", errorMessage(e)));
      setBusy(null);
    },
    copyName: (name: string) => void navigator.clipboard.writeText(name),
  };
}

export type BranchActions = ReturnType<typeof useBranchActions>;
