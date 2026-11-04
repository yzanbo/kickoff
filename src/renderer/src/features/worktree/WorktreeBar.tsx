import { ExternalLink, GitPullRequest, GitPullRequestArrow, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { PullRequestInfo } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { baseName } from "@/lib/format";
import { confirmRemoveWorktree } from "./removeWorktree";
import type { GitStatusController } from "@/features/editor/useGitStatus";
import { invalidateWorktrees } from "./worktreeBranches";

const PR_STATE_LABELS: Record<PullRequestInfo["state"], string> = { OPEN: "オープン", MERGED: "マージ済み", CLOSED: "クローズ" };

/**
 * ワークツリーの作業の流れ（エディタタブでワークツリーを選んでいるとき、作業場所の右に出す）。
 * プッシュして GitHub に PR を作る → GitHub でマージ → 「片付ける」でワークツリーとブランチを消し、本体を最新にする。
 * 右端のごみ箱で、PR の状態にかかわらずワークツリーを消せる（ブランチも消すかを選ぶ）
 */
export function WorktreeBar({
  projectId,
  worktree,
  git,
  onFinished,
}: {
  projectId: number;
  worktree: string;
  git: GitStatusController;
  /** 片付けたあと（作業場所を本体に戻す） */
  onFinished: () => void;
}) {
  const target = { projectId, worktree };
  const [pr, setPr] = useState<{ value: PullRequestInfo | null } | undefined>();
  const [busy, setBusy] = useState<"load" | "create" | "finish" | "remove">();
  const [error, setError] = useState<string>();
  const status = git.status?.repo ? git.status : undefined;

  // PR の状態は GitHub に聞くので、開いたとき・ウィンドウに戻ったとき・押したときだけ取り直す
  const load = async () => {
    setBusy("load");
    try {
      setPr({ value: await api.pullRequest(target) });
      setError(undefined);
    } catch (e) {
      // 途中で失敗しても、ワークツリーは消えていることがあるので、一覧を取り直す
      invalidateWorktrees(projectId);
      setError(errorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, worktree]);
  useWindowEvent("focus", () => void load());

  const create = async () => {
    setBusy("create");
    setError(undefined);
    try {
      setPr({ value: await api.createPullRequest(target) });
      void git.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };

  const finish = async () => {
    const ok = await confirmDialog({
      title: "ワークツリーを片付けますか？",
      message: `PR がマージされたので、${worktree} のフォルダと、手元のブランチ「${status?.branch ?? ""}」を消します。そのあと本体を最新にします。このワークツリーで作業していたチャットは、続きを本体で進めます。`,
      confirmLabel: "片付ける",
      danger: true,
    });
    if (!ok) return;
    setBusy("finish");
    setError(undefined);
    try {
      await api.finishWorktree(projectId, worktree);
      invalidateWorktrees(projectId);
      // 本体を最新にする（手元に変更があってできなければ、そう伝える）
      await api.gitPull(projectId).catch((e: unknown) => void alertDialog("本体を最新にできませんでした", errorMessage(e)));
      onFinished();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(undefined);
    }
  };

  // ワークツリーを消す（変更・プッシュしていないコミットを知らせ、ブランチも消すかを選んでもらう）
  const remove = async () => {
    setBusy("remove");
    setError(undefined);
    try {
      if (await confirmRemoveWorktree(projectId, { path: worktree, branch: status?.branch ?? null }, status?.branch ?? baseName(worktree))) onFinished();
      else setBusy(undefined);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(undefined);
    }
  };

  if (!status) return null;
  const value = pr?.value;
  return (
    <div className="worktree-bar">
      {!status.hasOrigin ? (
        <span className="muted">プッシュ先（origin）がないので、PR は作れません</span>
      ) : value ? (
        <>
          <span className={cx("pr-chip", value.state.toLowerCase())} title={value.title}>
            <GitPullRequest size={12} aria-hidden /> PR #{value.number}・{value.isDraft ? "下書き" : PR_STATE_LABELS[value.state]}
          </span>
          <button className="btn btn-sm" onClick={() => window.open(value.url)}>
            <ExternalLink size={12} aria-hidden /> PR を開く
          </button>
          {value.state === "MERGED" && (
            <button className="btn btn-sm btn-primary" disabled={Boolean(busy)} onClick={() => void finish()}>
              <Sparkles size={12} aria-hidden /> {busy === "finish" ? "片付け中…" : "片付ける"}
            </button>
          )}
        </>
      ) : (
        pr && (
          <button className="btn btn-sm" disabled={Boolean(busy)} title="まだプッシュしていなければ、先にプッシュします" onClick={() => void create()}>
            <GitPullRequestArrow size={12} aria-hidden /> {busy === "create" ? "PR を作っています…" : "PR を作る"}
          </button>
        )
      )}
      {status.hasOrigin && <RefreshButton label="PR の状態を取り直す" busy={busy === "load"} onClick={() => void load()} />}
      <IconButton icon={Trash2} label="ワークツリーを消す" title="このワークツリーを消す（ブランチも消すかを選べます）" disabled={Boolean(busy)} onClick={() => void remove()} />
      <ErrorText message={error} />
    </div>
  );
}
