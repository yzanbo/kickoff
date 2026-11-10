import { navigate } from "@/app/router";
import { alertDialog, choiceDialog, confirmDialog, promptWithCheck } from "@/ui/dialogs";
import { fileList, type BranchActions } from "./useBranchActions";
import type { GitLogController } from "./useGitLog";

/**
 * 退避（git stash）の操作（履歴の上の帯の「退避」・左の一覧の退避の行の右クリック・Git の操作の窓）。
 * 送り方・実行中の名前・失敗の知らせはブランチの操作と同じ（BranchActions の run）。
 * 戻した変更が作業中の変更とぶつかったら、変更タブで直すよう知らせる（マージとちがい途中の操作にはならないので「取りやめる」はない。pop でも退避は残る）
 */
export function useStashActions(projectId: number, branch: BranchActions, log: GitLogController) {
  const stashes = log.refs?.stashes ?? [];

  /** 戻したときに衝突したら、変更タブで直すか選んでもらう */
  const onConflicts = async (conflicts: string[]) => {
    const picked = await choiceDialog({
      title: `退避を戻したら衝突しました（${conflicts.length} 件）`,
      message: `${fileList(conflicts)}\n\n変更タブで衝突したところを直してから、解決済みにしてください。退避は消さずに残してあります。`,
      choices: [
        { value: "later", label: "あとで" },
        { value: "resolve", label: "変更タブで解決する", primary: true },
      ],
    });
    if (picked === "resolve") navigate({ name: "project", id: projectId, tab: "changes" });
  };

  /** 退避の表示名（メッセージ。なければ名前） */
  const labelOf = (ref: string) => stashes.find((s) => s.ref === ref)?.message ?? ref;

  return {
    stashes,
    /** 作業中の変更を退避する（メッセージと、未追跡のファイルも含めるかを聞く） */
    save: async () => {
      const picked = await promptWithCheck({
        title: "変更を退避",
        message: "コミットしていない変更をしまい、作業場所を最後のコミットの状態に戻します。あとで「戻す」で取り出せます。",
        label: "メッセージ（省略できます）",
        placeholder: "例: ログイン画面の途中",
        confirmLabel: "退避",
        optional: true,
        check: { label: "未追跡のファイルも退避する", initial: true },
      });
      if (picked) await branch.run("退避", { action: "stash_save", message: picked.value || null, include_untracked: picked.checked });
    },
    /** 退避を戻して消す（ぶつかったら残す） */
    pop: async (ref: string) => {
      if (await confirmDialog({ title: `退避「${labelOf(ref)}」を戻す`, message: "作業場所に戻して、退避の一覧から消します。", confirmLabel: "戻す" })) {
        await branch.run("退避の取り出し", { action: "stash_pop", ref }, onConflicts);
      }
    },
    /** 退避を戻す（一覧には残す） */
    apply: (ref: string) => branch.run("退避の適用", { action: "stash_apply", ref }, onConflicts),
    /** 退避を消す（確かめる） */
    drop: async (ref: string) => {
      if (await confirmDialog({ title: `退避「${labelOf(ref)}」を削除`, message: "退避した変更を捨てます。元に戻せません。", confirmLabel: "削除", danger: true })) {
        await branch.run("退避の削除", { action: "stash_drop", ref });
      }
    },
    /** 退避がないときの知らせ（帯の ▾ から最新を選んだが、ひとつもないとき） */
    none: () => alertDialog("退避はありません", "「退避」でコミットしていない変更をしまえます。"),
  };
}

export type StashActions = ReturnType<typeof useStashActions>;
