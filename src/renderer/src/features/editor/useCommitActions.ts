import { useState } from "react";
import type { GitStatus } from "@shared/types";
import type { ActionState } from "@/hooks/useAction";
import { confirmDialog } from "@/ui/dialogs";
import type { GitStatusController } from "./useGitStatus";

/** コミットの欄の操作（実行中は、ほかの操作のボタンも押せなくする） */
export type CommitBusy = "commit" | "push" | "pull";

/** コミットの仕方（VS Code のコミットのボタンの ▾ と同じ 4 つ。sync はプル（遅れているとき）・コミット・プッシュ） */
export type CommitMode = "commit" | "amend" | "push" | "sync";

export type CommitActions = ReturnType<typeof useCommitActions>;

/**
 * 「変更」のコミット・プッシュ・プルの状態と操作（コミットの欄 CommitBox と、見出しの ✓・「…」のメニューで共通。メッセージもここで持つ）。
 * ステージしたものがなければ、すべてステージしてコミットするか確かめる。修正（amend）でプッシュ済みのコミットを書き直すときも確かめる
 */
export function useCommitActions({ status, git, action }: { status: Extract<GitStatus, { repo: true }>; git: GitStatusController; action: ActionState<CommitBusy> }) {
  const [message, setMessage] = useState("");
  const { busy } = action;
  const changes = [...status.conflicts, ...status.unstaged];
  const canCommit = status.staged.length > 0 || changes.length > 0;
  // プッシュするもの: 進んでいるコミット、またはまだ公開していないブランチ（origin があるとき）
  const publish = !status.upstream && status.has_origin && status.branch !== null;
  const canPush = status.has_origin && status.branch !== null;

  const commit = async (mode: CommitMode = "commit") => {
    if (busy) return;
    const amend = mode === "amend";
    if (!amend && !canCommit) return;
    if (!amend && !message.trim()) return action.setError("コミットのメッセージを入れてください");
    // 修正は、ステージしたもの（なければメッセージだけ）を直前のコミットに足す。ふつうのコミットでステージしたものがなければ、すべてステージするか聞く
    const stageAll = !amend && status.staged.length === 0;
    if (
      stageAll &&
      !(await confirmDialog({
        title: "ステージした変更がありません",
        message: "すべての変更をステージしてコミットしますか？",
        confirmLabel: "すべてステージしてコミット",
      }))
    )
      return;
    // プッシュ済みのコミットを書き直すと、手元とリモートが分かれる（ふつうのプッシュでは送れなくなる）
    if (
      amend &&
      status.upstream &&
      status.ahead === 0 &&
      !(await confirmDialog({
        title: "プッシュ済みのコミットを修正しますか？",
        message: "直前のコミットはもうリモートにあります。書き直すと手元とリモートが分かれ、ふつうのプッシュでは送れなくなります。",
        confirmLabel: "修正する",
        danger: true,
      }))
    )
      return;
    await action.run("commit", async () => {
      if (stageAll) await git.act("stage", changes.map((f) => f.path));
      // 同期は、遅れている分を先に早送りで取り込んでからコミットする（コミットのあとでは早送りできないため）
      if (mode === "sync" && status.behind > 0) await git.pull();
      await git.commit(message, amend);
      setMessage("");
      if (mode === "push" || mode === "sync") await git.push();
    });
  };

  const push = async () => {
    if (!busy) await action.run("push", () => git.push());
  };

  // リモートより遅れていれば、早送りで取り込む（GitHub でマージした PR を手元に入れるときなど）
  const pull = async () => {
    if (!busy) await action.run("pull", () => git.pull());
  };

  return { message, setMessage, busy, canCommit, canPush, publish, commit, push, pull };
}
