import { ExternalLink, GitPullRequest, GitPullRequestArrow, Sparkles, Trash2 } from "lucide-react";
import type { PullRequestInfo } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";
import { useAction } from "@/hooks/useAction";
import { useAsync } from "@/hooks/useAsync";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { baseName } from "@/lib/format";
import { confirmRemoveWorktree } from "./removeWorktree";
import type { GitStatusController } from "@/features/editor/useGitStatus";
import { worktreesStore } from "@/stores/worktrees";
import { useWorktreePrLookup } from "@/stores/worktreePrs";
import { openPrNotice } from "./prNotice/PrNoticeDialog";

const PR_STATE_LABELS: Record<PullRequestInfo["state"], string> = { OPEN: "オープン", MERGED: "マージ済み", CLOSED: "クローズ" };

/**
 * ワークツリーの作業の流れ（ファイルタブでワークツリーを選んでいるとき、作業場所の右に出す）。
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
  const status = git.status?.repo ? git.status : undefined;

  // PR の状態は GitHub に聞くので、開いたとき・ウィンドウに戻ったとき・押したときだけ取り直す（null は PR がまだない）
  const pr = useAsync<PullRequestInfo | null>(
    () =>
      api.pullRequest(target).catch((e: unknown) => {
        // 途中で失敗しても、ワークツリーは消えていることがあるので、一覧を取り直す
        worktreesStore.invalidate(projectId);
        throw e;
      }),
    [projectId, worktree],
  );
  useWindowEvent("focus", pr.reload);
  // PR を作る・片付ける・消すの実行中と失敗（PR の状態を取り直している間も押せなくする。届いた状態で作った PR を上書きしないため）
  const action = useAction<"create" | "finish" | "remove">();
  const busy = action.busy !== null || pr.loading;

  const create = () =>
    action.run("create", async () => {
      pr.setData(await api.createPullRequest(target));
      void git.refresh();
    });

  // 見張りの知らせがあれば、「片付ける」はその確認（チャットの扱いも一緒に選ぶ）を開く
  const prNotice = useWorktreePrLookup()(worktree);
  const finish = async () => {
    if (prNotice) return openPrNotice(prNotice);
    const ok = await confirmDialog({
      title: "ワークツリーを片付けますか？",
      message: `PR がマージされたので、${worktree} のフォルダと、手元のブランチ「${status?.branch ?? ""}」を消します。そのあと本体を最新にします。このワークツリーで作業していたチャットは、続きを本体で進めます。`,
      confirmLabel: "片付ける",
      danger: true,
    });
    if (!ok) return;
    await action.run("finish", async () => {
      // 片付け = ブランチも消す「消す」（コミットしていない変更があれば、消さずに失敗する）
      await api.removeWorktree(projectId, worktree, false, true);
      worktreesStore.invalidate(projectId);
      // 本体を最新にする（手元に変更があってできなければ、そう伝える）
      await api.gitPull(projectId).catch((e: unknown) => void alertDialog("本体を最新にできませんでした", errorMessage(e)));
      onFinished();
    });
  };

  // ワークツリーを消す（変更・プッシュしていないコミットを知らせ、ブランチも消すかを選んでもらう）
  const remove = () =>
    action.run("remove", async () => {
      if (await confirmRemoveWorktree(projectId, { path: worktree, branch: status?.branch ?? null }, status?.branch ?? baseName(worktree))) onFinished();
    });

  if (!status) return null;
  const value = pr.data;
  return (
    <div className="worktree-bar">
      {!status.has_origin ? (
        <span className="muted">プッシュ先（origin）がないので、PR は作れません</span>
      ) : value ? (
        <>
          <span className={cx("pr-chip", value.state.toLowerCase())} title={value.title}>
            <GitPullRequest size={12} aria-hidden /> PR #{value.number}・{value.is_draft ? "下書き" : PR_STATE_LABELS[value.state]}
          </span>
          <button className="btn btn-sm" onClick={() => window.open(value.url)}>
            <ExternalLink size={12} aria-hidden /> PR を開く
          </button>
          {value.state === "MERGED" && (
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void finish()}>
              <Sparkles size={12} aria-hidden /> {action.busy === "finish" ? "片付け中…" : "片付ける"}
            </button>
          )}
        </>
      ) : (
        value === null && (
          <button className="btn btn-sm" disabled={busy} title="まだプッシュしていなければ、先にプッシュします" onClick={() => void create()}>
            <GitPullRequestArrow size={12} aria-hidden /> {action.busy === "create" ? "PR を作っています…" : "PR を作る"}
          </button>
        )
      )}
      {status.has_origin && <RefreshButton label="PR の状態を取り直す" busy={pr.loading} onClick={pr.reload} />}
      <IconButton icon={Trash2} label="ワークツリーを消す" title="このワークツリーを消す（ブランチも消すかを選べます）" disabled={busy} onClick={() => void remove()} />
      <ErrorText message={action.error ?? pr.error} />
    </div>
  );
}
