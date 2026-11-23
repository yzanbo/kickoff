import { useState } from "react";
import type { GitBranchAction, GitBranchActionResult, GitOperation, GitRefs } from "@shared/git/types";
import { GIT_OPERATION_LABELS } from "@shared/git/labels";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { navigate } from "@/foundation/ui/navigation/router";
import { useChats } from "@/features/chat/ui/store/knownChats";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { alert, choose, confirm, prompt } from "@/foundation/ui/kit/ask";
import { countBusyAt } from "@/foundation/ui/workplace/workplace";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import type { GitStatusController } from "@/features/git/ui/useGitStatus";
import type { GitLogController } from "./useGitLog";
import { gitApi } from "@/features/git/ui/api";
import { workdirInput } from "@/foundation/ui/api/workdir";

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
  const target = useWorkplace(projectId);
  const { chats } = useChats({ projectId });
  const [busy, setBusy] = useState<string | null>(null);
  const refs: GitRefs | undefined = log.refs;
  const status = git.status?.repo ? git.status : undefined;
  const current = status?.branch ?? null;
  // この作業場所で作業中のチャット（チェックアウト・マージでファイルが入れ替わると、作業がぶつかる）
  const busyChats = countBusyAt(chats, target.worktree);
  const dirty = Boolean(status && status.staged.length + status.unstaged.length + status.conflicts.length > 0);

  /** ファイルが入れ替わる操作の前の注意（作業中のチャット・コミットしていない変更）。どちらもなければ空 */
  const filesWarning = (): string[] => [
    ...(busyChats > 0 ? [`この作業場所では ${busyChats} 件のチャットが作業中です。ファイルが入れ替わると、作業がぶつかります。`] : []),
    ...(dirty ? ["コミットしていない変更は、そのまま持っていきます（ぶつかるときは git が取りやめます）。"] : []),
  ];

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

  /**
   * 操作を 1 つ送る（実行中の名前を出し、失敗はダイアログで知らせる）。衝突したら operation の名前で選んでもらう
   * （途中の操作にならない衝突（退避を戻したときなど）は、関数を渡してそちらで知らせる）
   */
  const run = async (name: string, body: GitBranchAction, operation?: GitOperation | ((conflicts: string[]) => Promise<void>)): Promise<GitBranchActionResult | null> => {
    setBusy(name);
    const result = await sendAction(body, operation).catch(async (e: unknown) => {
      await alert(`${name}できませんでした`, errorMessage(e));
      return null;
    });
    setBusy(null);
    return result;
  };
  /** 操作を送り、Git の状態と履歴を取り直し、衝突したら選んでもらう（失敗は投げる） */
  const sendAction = async (body: GitBranchAction, operation?: GitOperation | ((conflicts: string[]) => Promise<void>)): Promise<GitBranchActionResult> => {
    // プル・プッシュなどはリモートの参照も書き換えるので、自動のフェッチの途中なら終わるのを待つ
    const result = await gitApi("POST /api/projects/:projectId/git/branch-action", { ...workdirInput(target), body });
    git.applyStatus(result.status);
    log.refresh();
    const stopped = result.status.repo ? result.status.operation : null;
    if (result.conflicts.length > 0) {
      if (typeof operation === "function") await operation(result.conflicts);
      else await handleConflicts(result.conflicts, stopped ?? operation ?? "merge");
    }
    return result;
  };

  /** マージ・リベースの前に見込みを見せて確かめる（取り込むものがなければ知らせるだけ） */
  const confirmMerge = async (kind: "merge" | "rebase", other: string): Promise<boolean> => {
    if (!current) {
      await alert("ブランチから外れています", "マージ・リベースは、ブランチをチェックアウトしてから行ってください。");
      return false;
    }
    let preview;
    try {
      preview = await gitApi("GET /api/projects/:projectId/git/merge-preview", workdirInput(target, { branch: other }));
    } catch (e) {
      await alert("見込みを調べられませんでした", errorMessage(e));
      return false;
    }
    if (preview.up_to_date) {
      await alert("取り込むものはありません", `「${current}」には「${other}」のコミットがすべて入っています。`);
      return false;
    }
    const outlook = preview.fast_forward
      ? "早送りで済みます（衝突しません）。"
      : preview.conflicts.length > 0
        ? `衝突しそうなファイルがあります（${preview.conflicts.length} 件）:\n${fileList(preview.conflicts)}\n\n進めると衝突したところで止まり、変更タブで解いてから続けます（取りやめることもできます）。`
        : "衝突せずにできる見込みです。";
    const title = kind === "merge" ? `「${current}」に「${other}」をマージ` : `「${current}」を「${other}」の上にリベース`;
    return confirm({ title, message: [outlook, ...filesWarning()].join("\n\n"), confirmLabel: kind === "merge" ? "マージ" : "リベース" }).then((r) => r !== null);
  };

  const branchOf = (name: string) => refs?.branches.find((b) => b.name === name);

  /** ブランチをワークツリーとして取り出し、作ったら見ている作業場所をそこへ切り替えるか聞く（失敗は投げる） */
  const addBranchWorktree = async (branch: string) => {
    const list = await api.addWorktree(projectId, branch);
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
    /** ファイルが入れ替わる操作の前の注意 */
    filesWarning,
    remotes: refs?.remotes ?? [],

    /** 手元のブランチをチェックアウト（ファイルが入れ替わるときの注意があれば確かめる） */
    checkout: async (branch: string) => {
      const warnings = filesWarning();
      if (warnings.length > 0 && !(await confirm({ title: `「${branch}」をチェックアウト`, message: warnings.join("\n\n"), confirmLabel: "チェックアウト" }))) return;
      await run("チェックアウト", { action: "checkout", branch });
    },
    /** リモートのブランチをチェックアウト（追いかける手元のブランチを作る。もう追いかけているブランチがあれば、それをチェックアウト） */
    checkoutRemote: async (remoteBranch: string, remote: string) => {
      const tracking = refs?.branches.find((b) => b.upstream === remoteBranch);
      if (tracking) {
        if (tracking.current) return;
        const warnings = filesWarning();
        if (warnings.length > 0 && !(await confirm({ title: `「${tracking.name}」をチェックアウト`, message: warnings.join("\n\n"), confirmLabel: "チェックアウト" }))) return;
        await run("チェックアウト", { action: "checkout", branch: tracking.name });
        return;
      }
      const name = await prompt({
        title: `「${remoteBranch}」をチェックアウト`,
        message: [`「${remoteBranch}」を追いかける手元のブランチを作って、チェックアウトします。`, ...filesWarning()].join("\n\n"),
        label: "手元のブランチの名前",
        initial: remoteBranch.slice(remote.length + 1),
        confirmLabel: "チェックアウト",
      }).then((r) => r?.value ?? null);
      if (name) await run("チェックアウト", { action: "checkout_remote", remote_branch: remoteBranch, name });
    },
    /** タグ・コミットをチェックアウト（ブランチから外れる） */
    checkoutDetached: async (ref: string) => {
      const ok = await confirm({
        title: `「${ref}」をチェックアウト`,
        message: ["ブランチから外れた状態（detached HEAD）になります。ここでコミットするなら、先に新しいブランチを作ってください。", ...filesWarning()].join("\n\n"),
        confirmLabel: "チェックアウト",
      });
      if (ok) await run("チェックアウト", { action: "checkout_detached", ref });
    },
    /** ブランチをワークツリーとして取り出す（作ったら、見ている作業場所をそこへ切り替えるか聞く） */
    checkoutAsWorktree: async (branch: string) => {
      setBusy("ワークツリーの作成");
      await addBranchWorktree(branch).catch((e: unknown) => alert("ワークツリーを作れませんでした", errorMessage(e)));
      setBusy(null);
    },
    fastForward: (branch: string) => run("早送り", { action: "fast_forward", branch }),
    pull: async (branch: string) => {
      // いまのブランチは分かれていればマージになるので、作業中のチャットがあれば確かめる
      if (branch === current && busyChats > 0 && !(await confirm({ title: `「${branch}」をプル`, message: filesWarning().join("\n\n"), confirmLabel: "プル" }))) return;
      await run("プル", { action: "pull", branch }, "merge");
    },
    push: async (branch: string) => {
      const upstream = branchOf(branch)?.upstream;
      const ok = await confirm({
        title: `「${branch}」をプッシュ`,
        message: upstream ? `「${upstream}」へプッシュします。` : "まだリモートにないので、origin に同じ名前で公開し、追いかけるようにします。",
        confirmLabel: "プッシュ",
      });
      if (ok) await run("プッシュ", { action: "push", branch });
    },
    pushAndCreatePr: async (branch: string) => {
      const ok = await confirm({ title: `「${branch}」をプッシュして PR を作る`, message: "プッシュしてから、GitHub に PR を作ります（タイトルと本文はコミットから）。", confirmLabel: "PR を作る" });
      if (!ok) return;
      const result = await run("PR の作成", { action: "push_pr", branch });
      if (result?.pr) await alert(`PR #${result.pr.number} を作りました`, `${result.pr.title}\n${result.pr.url}`);
    },
    merge: async (source: string) => {
      if (await confirmMerge("merge", source)) await run("マージ", { action: "merge", branch: source }, "merge");
    },
    rebase: async (onto: string) => {
      if (await confirmMerge("rebase", onto)) await run("リベース", { action: "rebase", branch: onto }, "rebase");
    },
    /** 新しいブランチ（from から。作ったらチェックアウトするかも選ぶ） */
    createBranch: async (from: string, fromLabel = from) => {
      const picked = await prompt({
        title: "新しいブランチ",
        message: `「${fromLabel}」から作ります。`,
        label: "ブランチの名前",
        placeholder: "例: feature/login",
        confirmLabel: "作る",
        checks: [{ label: "作ったらチェックアウトする", initial: busyChats === 0, help: (on) => (on && busyChats > 0 ? filesWarning()[0] : "") }],
      }).then((r) => r && { value: r.value, checked: r.checked[0] });
      if (picked) await run("ブランチの作成", { action: "create_branch", name: picked.value, from, checkout: picked.checked });
    },
    /** 新しいタグ（at に付ける。注釈つきのタグで、メッセージはタグの名前。origin にもプッシュするかも選ぶ） */
    createTag: async (at: string, atLabel = at) => {
      const picked = await prompt({
        title: "新しいタグ",
        message: `「${atLabel}」に付けます。`,
        label: "タグの名前",
        placeholder: "例: v1.0.0",
        confirmLabel: "作る",
        checks: [{ label: "origin にもプッシュする", initial: false }],
      }).then((r) => r && { value: r.value, checked: r.checked[0] });
      if (picked) await run("タグの作成", { action: "create_tag", name: picked.value, at, message: picked.value, push: picked.checked });
    },
    setUpstream: (branch: string, upstream: string | null) => run("追跡の設定", { action: "set_upstream", branch, upstream }),
    rename: async (branch: string) => {
      const name = await prompt({ title: `「${branch}」の名前を変更`, label: "新しい名前", initial: branch, confirmLabel: "変更" }).then((r) => r?.value ?? null);
      if (name && name !== branch) await run("名前の変更", { action: "rename_branch", branch, name });
    },
    /** ブランチを消す（リモートのブランチも消すかを選ぶ。マージしていなければ、強制で消すか確かめ直す） */
    deleteBranch: async (branch: string) => {
      const upstream = branchOf(branch)?.upstream;
      const picked = upstream
        ? await confirm({ title: `「${branch}」を削除`, message: "手元のブランチを消します。", confirmLabel: "削除", danger: true, checks: [{ label: `リモートのブランチ「${upstream}」も消す`, initial: false }] }).then((r) => r && { checked: r.checked[0] })
        : (await confirm({ title: `「${branch}」を削除`, message: "手元のブランチを消します。", confirmLabel: "削除", danger: true }))
          ? { checked: false }
          : null;
      if (!picked) return;
      setBusy("ブランチの削除");
      await deleteLocalBranch(branch, picked.checked).catch((e: unknown) => alert("削除できませんでした", errorMessage(e)));
      setBusy(null);
    },
    deleteRemoteBranch: async (remoteBranch: string) => {
      const ok = await confirm({ title: `リモートのブランチ「${remoteBranch}」を削除`, message: "リモートからブランチを消します（ほかの人の手元のブランチは残ります）。", confirmLabel: "削除", danger: true });
      if (ok) await run("リモートのブランチの削除", { action: "delete_remote_branch", remote_branch: remoteBranch });
    },
    pushTag: async (name: string) => {
      if (await confirm({ title: `タグ「${name}」をプッシュ`, message: "origin へプッシュします。", confirmLabel: "プッシュ" })) await run("タグのプッシュ", { action: "push_tag", name });
    },
    deleteTag: async (name: string) => {
      const picked = await confirm({ title: `タグ「${name}」を削除`, message: "手元のタグを消します。", confirmLabel: "削除", danger: true, checks: [{ label: "origin のタグも消す", initial: false }] }).then((r) => r && { checked: r.checked[0] });
      if (picked) await run("タグの削除", { action: "delete_tag", name, remote: picked.checked });
    },
    copyName: (name: string) => void navigator.clipboard.writeText(name),
  };
}

export type BranchActions = ReturnType<typeof useBranchActions>;
