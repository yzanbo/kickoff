import { useState } from "react";
import type { GitBranchAction, GitBranchActionResult, GitOperation, GitRefs } from "@shared/types";
import { GIT_OPERATION_LABELS } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { navigate } from "@/app/router";
import { useChats } from "@/stores/chats";
import { worktreesStore } from "@/stores/worktrees";
import { alertDialog, choiceDialog, confirmDialog, confirmWithCheck, promptDialog, promptWithCheck } from "@/ui/dialogs";
import { countBusyAt } from "@/features/worktree/workplace";
import { useGitTarget } from "@/features/worktree/worktreeContext";
import type { GitStatusController } from "@/features/editor/useGitStatus";
import type { GitLogController } from "./useGitLog";

/** 衝突したファイルを、ダイアログに出す数まで並べる */
export function fileList(files: string[], max = 8): string {
  const shown = files.slice(0, max).map((f) => `・${f}`);
  if (files.length > max) shown.push(`ほか ${files.length - max} 件`);
  return shown.join("\n");
}

/**
 * 履歴の右クリックのブランチ・タグの操作（チェックアウト・プッシュ・マージなど）。確かめのダイアログを出してから行い、
 * 終わったら Git の状態と履歴を取り直す。マージ・リベース・プルで衝突したら、変更タブで解くか取りやめるかを選んでもらう（
 * マージ・リベースの前に衝突しそうなファイルも見せる）。busy は実行中の操作の名前（見出しに出す）
 */
export function useBranchActions(projectId: number, log: GitLogController, git: GitStatusController, onWorktreeChange: (worktree: string | undefined) => void) {
  const { target, worktree } = useGitTarget(projectId);
  const { chats } = useChats({ projectId });
  const [busy, setBusy] = useState<string | null>(null);
  const refs: GitRefs | undefined = log.refs;
  const status = git.status?.repo ? git.status : undefined;
  const current = status?.branch ?? null;
  // この作業場所で作業中のチャット（チェックアウト・マージでファイルが入れ替わると、作業がぶつかる）
  const busyChats = countBusyAt(chats, worktree ?? null);
  const dirty = Boolean(status && status.staged.length + status.unstaged.length + status.conflicts.length > 0);

  /** ファイルが入れ替わる操作の前の注意（作業中のチャット・コミットしていない変更）。どちらもなければ空 */
  const filesWarning = (): string[] => [
    ...(busyChats > 0 ? [`この作業場所では ${busyChats} 件のチャットが作業中です。ファイルが入れ替わると、作業がぶつかります。`] : []),
    ...(dirty ? ["コミットしていない変更は、そのまま持っていきます（ぶつかるときは git が取りやめます）。"] : []),
  ];

  /** 衝突して止まったとき: 変更タブで解くか、取りやめて元に戻すかを選んでもらう */
  const handleConflicts = async (conflicts: string[], operation: GitOperation) => {
    const label = GIT_OPERATION_LABELS[operation];
    const picked = await choiceDialog({
      title: `${label}で衝突しました（${conflicts.length} 件）`,
      message: `${fileList(conflicts)}\n\n変更タブで衝突したファイルを直し（こちらの版・取り込む側の版を選ぶこともできます）、解決済みにしてから「続ける」を押してください。取りやめると、${label}の前の状態に戻ります。`,
      choices: [
        { value: "abort", label: "取りやめる" },
        { value: "resolve", label: "変更タブで解決する", primary: true },
      ],
    });
    if (picked === "abort") {
      await git.operate("abort").catch((e: unknown) => alertDialog("取りやめられませんでした", errorMessage(e)));
      log.refresh();
    } else if (picked === "resolve") {
      navigate({ name: "project", id: projectId, tab: "changes" });
    }
  };

  /**
   * 操作を 1 つ送る（実行中の名前を出し、失敗はダイアログで知らせる）。衝突したら operation の名前で選んでもらう
   * （途中の操作にならない衝突（退避を戻したときなど）は、関数を渡してそちらで知らせる）
   */
  const run = async (name: string, body: GitBranchAction, operation?: GitOperation | ((conflicts: string[]) => Promise<void>)): Promise<GitBranchActionResult | null> => {
    setBusy(name);
    try {
      const result = await api.gitBranchAction(target, body);
      git.applyStatus(result.status);
      log.refresh();
      const stopped = result.status.repo ? result.status.operation : null;
      if (result.conflicts.length > 0) {
        if (typeof operation === "function") await operation(result.conflicts);
        else await handleConflicts(result.conflicts, stopped ?? operation ?? "merge");
      }
      return result;
    } catch (e) {
      await alertDialog(`${name}できませんでした`, errorMessage(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** マージ・リベースの前に見込みを見せて確かめる（取り込むものがなければ知らせるだけ） */
  const confirmMerge = async (kind: "merge" | "rebase", other: string): Promise<boolean> => {
    if (!current) {
      await alertDialog("ブランチから外れています", "マージ・リベースは、ブランチをチェックアウトしてから行ってください。");
      return false;
    }
    let preview;
    try {
      preview = await api.gitMergePreview(target, other);
    } catch (e) {
      await alertDialog("見込みを調べられませんでした", errorMessage(e));
      return false;
    }
    if (preview.up_to_date) {
      await alertDialog("取り込むものはありません", `「${current}」には「${other}」のコミットがすべて入っています。`);
      return false;
    }
    const outlook = preview.fast_forward
      ? "早送りで済みます（衝突しません）。"
      : preview.conflicts.length > 0
        ? `衝突しそうなファイルがあります（${preview.conflicts.length} 件）:\n${fileList(preview.conflicts)}\n\n進めると衝突したところで止まり、変更タブで解いてから続けます（取りやめることもできます）。`
        : "衝突せずにできる見込みです。";
    const title = kind === "merge" ? `「${current}」に「${other}」をマージ` : `「${current}」を「${other}」の上にリベース`;
    return confirmDialog({ title, message: [outlook, ...filesWarning()].join("\n\n"), confirmLabel: kind === "merge" ? "マージ" : "リベース" });
  };

  const branchOf = (name: string) => refs?.branches.find((b) => b.name === name);

  return {
    busy,
    current,
    /** 操作を 1 つ送る（退避の操作 useStashActions も使う） */
    run,
    /** ファイルが入れ替わる操作の前の注意 */
    filesWarning,
    remotes: refs?.remotes ?? [],

    /** 手元のブランチをチェックアウト（ファイルが入れ替わるときの注意があれば確かめる） */
    checkout: async (branch: string) => {
      const warnings = filesWarning();
      if (warnings.length > 0 && !(await confirmDialog({ title: `「${branch}」をチェックアウト`, message: warnings.join("\n\n"), confirmLabel: "チェックアウト" }))) return;
      await run("チェックアウト", { action: "checkout", branch });
    },
    /** リモートのブランチをチェックアウト（追いかける手元のブランチを作る。もう追いかけているブランチがあれば、それをチェックアウト） */
    checkoutRemote: async (remoteBranch: string, remote: string) => {
      const tracking = refs?.branches.find((b) => b.upstream === remoteBranch);
      if (tracking) {
        if (tracking.current) return;
        const warnings = filesWarning();
        if (warnings.length > 0 && !(await confirmDialog({ title: `「${tracking.name}」をチェックアウト`, message: warnings.join("\n\n"), confirmLabel: "チェックアウト" }))) return;
        await run("チェックアウト", { action: "checkout", branch: tracking.name });
        return;
      }
      const name = await promptDialog({
        title: `「${remoteBranch}」をチェックアウト`,
        message: [`「${remoteBranch}」を追いかける手元のブランチを作って、チェックアウトします。`, ...filesWarning()].join("\n\n"),
        label: "手元のブランチの名前",
        initial: remoteBranch.slice(remote.length + 1),
        confirmLabel: "チェックアウト",
      });
      if (name) await run("チェックアウト", { action: "checkout_remote", remote_branch: remoteBranch, name });
    },
    /** タグ・コミットをチェックアウト（ブランチから外れる） */
    checkoutDetached: async (ref: string) => {
      const ok = await confirmDialog({
        title: `「${ref}」をチェックアウト`,
        message: ["ブランチから外れた状態（detached HEAD）になります。ここでコミットするなら、先に新しいブランチを作ってください。", ...filesWarning()].join("\n\n"),
        confirmLabel: "チェックアウト",
      });
      if (ok) await run("チェックアウト", { action: "checkout_detached", ref });
    },
    /** ブランチをワークツリーとして取り出す（作ったら、見ている作業場所をそこへ切り替えるか聞く） */
    checkoutAsWorktree: async (branch: string) => {
      setBusy("ワークツリーの作成");
      try {
        const list = await api.addWorktree(projectId, branch);
        worktreesStore.set(projectId, list);
        worktreesStore.invalidate(projectId);
        log.refresh();
        const made = list.find((w) => w.branch === branch);
        if (made && (await confirmDialog({ title: "ワークツリーを作りました", message: made.path, confirmLabel: "この作業場所に切り替える" }))) onWorktreeChange(made.path);
      } catch (e) {
        await alertDialog("ワークツリーを作れませんでした", errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    fastForward: (branch: string) => run("早送り", { action: "fast_forward", branch }),
    pull: async (branch: string) => {
      // いまのブランチは分かれていればマージになるので、作業中のチャットがあれば確かめる
      if (branch === current && busyChats > 0 && !(await confirmDialog({ title: `「${branch}」をプル`, message: filesWarning().join("\n\n"), confirmLabel: "プル" }))) return;
      await run("プル", { action: "pull", branch }, "merge");
    },
    push: async (branch: string) => {
      const upstream = branchOf(branch)?.upstream;
      const ok = await confirmDialog({
        title: `「${branch}」をプッシュ`,
        message: upstream ? `「${upstream}」へプッシュします。` : "まだリモートにないので、origin に同じ名前で公開し、追いかけるようにします。",
        confirmLabel: "プッシュ",
      });
      if (ok) await run("プッシュ", { action: "push", branch });
    },
    pushAndCreatePr: async (branch: string) => {
      const ok = await confirmDialog({ title: `「${branch}」をプッシュして PR を作る`, message: "プッシュしてから、GitHub に PR を作ります（タイトルと本文はコミットから）。", confirmLabel: "PR を作る" });
      if (!ok) return;
      const result = await run("PR の作成", { action: "push_pr", branch });
      if (result?.pr) await alertDialog(`PR #${result.pr.number} を作りました`, `${result.pr.title}\n${result.pr.url}`);
    },
    merge: async (source: string) => {
      if (await confirmMerge("merge", source)) await run("マージ", { action: "merge", branch: source }, "merge");
    },
    rebase: async (onto: string) => {
      if (await confirmMerge("rebase", onto)) await run("リベース", { action: "rebase", branch: onto }, "rebase");
    },
    /** 新しいブランチ（from から。作ったらチェックアウトするかも選ぶ） */
    createBranch: async (from: string, fromLabel = from) => {
      const picked = await promptWithCheck({
        title: "新しいブランチ",
        message: `「${fromLabel}」から作ります。`,
        label: "ブランチの名前",
        placeholder: "例: feature/login",
        confirmLabel: "作る",
        check: { label: "作ったらチェックアウトする", initial: busyChats === 0, help: (on) => (on && busyChats > 0 ? filesWarning()[0] : "") },
      });
      if (picked) await run("ブランチの作成", { action: "create_branch", name: picked.value, from, checkout: picked.checked });
    },
    /** 新しいタグ（at に付ける。注釈つきのタグで、メッセージはタグの名前。origin にもプッシュするかも選ぶ） */
    createTag: async (at: string, atLabel = at) => {
      const picked = await promptWithCheck({
        title: "新しいタグ",
        message: `「${atLabel}」に付けます。`,
        label: "タグの名前",
        placeholder: "例: v1.0.0",
        confirmLabel: "作る",
        check: { label: "origin にもプッシュする", initial: false },
      });
      if (picked) await run("タグの作成", { action: "create_tag", name: picked.value, at, message: picked.value, push: picked.checked });
    },
    setUpstream: (branch: string, upstream: string | null) => run("追跡の設定", { action: "set_upstream", branch, upstream }),
    rename: async (branch: string) => {
      const name = await promptDialog({ title: `「${branch}」の名前を変更`, label: "新しい名前", initial: branch, confirmLabel: "変更" });
      if (name && name !== branch) await run("名前の変更", { action: "rename_branch", branch, name });
    },
    /** ブランチを消す（リモートのブランチも消すかを選ぶ。マージしていなければ、強制で消すか確かめ直す） */
    deleteBranch: async (branch: string) => {
      const upstream = branchOf(branch)?.upstream;
      const picked = upstream
        ? await confirmWithCheck({ title: `「${branch}」を削除`, message: "手元のブランチを消します。", confirmLabel: "削除", danger: true, check: { label: `リモートのブランチ「${upstream}」も消す`, initial: false } })
        : (await confirmDialog({ title: `「${branch}」を削除`, message: "手元のブランチを消します。", confirmLabel: "削除", danger: true }))
          ? { checked: false }
          : null;
      if (!picked) return;
      setBusy("ブランチの削除");
      try {
        let result;
        try {
          result = await api.gitBranchAction(target, { action: "delete_branch", branch, force: false, remote: picked.checked });
        } catch (e) {
          // マージしていないコミットがあると -d では消せないので、消えてもよいか確かめ直す
          if (!/not fully merged/.test(errorMessage(e))) throw e;
          const force = await confirmDialog({
            title: `「${branch}」はマージしていません`,
            message: "ほかのブランチに入っていないコミットがあります。消すと、そのコミットはたどれなくなります。",
            confirmLabel: "それでも削除",
            danger: true,
          });
          if (!force) return;
          result = await api.gitBranchAction(target, { action: "delete_branch", branch, force: true, remote: picked.checked });
        }
        git.applyStatus(result.status);
        log.refresh();
      } catch (e) {
        await alertDialog("削除できませんでした", errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    deleteRemoteBranch: async (remoteBranch: string) => {
      const ok = await confirmDialog({ title: `リモートのブランチ「${remoteBranch}」を削除`, message: "リモートからブランチを消します（ほかの人の手元のブランチは残ります）。", confirmLabel: "削除", danger: true });
      if (ok) await run("リモートのブランチの削除", { action: "delete_remote_branch", remote_branch: remoteBranch });
    },
    pushTag: async (name: string) => {
      if (await confirmDialog({ title: `タグ「${name}」をプッシュ`, message: "origin へプッシュします。", confirmLabel: "プッシュ" })) await run("タグのプッシュ", { action: "push_tag", name });
    },
    deleteTag: async (name: string) => {
      const picked = await confirmWithCheck({ title: `タグ「${name}」を削除`, message: "手元のタグを消します。", confirmLabel: "削除", danger: true, check: { label: "origin のタグも消す", initial: false } });
      if (picked) await run("タグの削除", { action: "delete_tag", name, remote: picked.checked });
    },
    copyName: (name: string) => void navigator.clipboard.writeText(name),
  };
}

export type BranchActions = ReturnType<typeof useBranchActions>;
