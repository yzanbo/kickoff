import { ExternalLink, Globe, GitPullRequest, GitPullRequestArrow, Sparkles, Trash2, TriangleAlert, WandSparkles } from "lucide-react";
import type { PullRequestInfo } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { alertDialog, confirmDialog, confirmWithChecks } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";
import { useAction } from "@/hooks/useAction";
import { useAsync } from "@/hooks/useAsync";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { baseName } from "@/lib/format";
import { confirmRemoveWorktree } from "./removeWorktree";
import type { GitStatusController } from "@/features/editor/useGitStatus";
import { useWorktreeEnv, worktreesStore } from "@/stores/worktrees";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { appAddress, removalChecks } from "./worktreeEnvText";
import { useWorktreePrLookup } from "@/stores/worktreePrs";
import { addChat } from "@/stores/chats";
import { openChat } from "@/app/router";
import { openPrNotice } from "./prNotice/PrNoticeDialog";

const PR_STATE_LABELS: Record<PullRequestInfo["state"], string> = { OPEN: "オープン", MERGED: "マージ済み", CLOSED: "クローズ" };

/**
 * ワークツリーの作業の流れ（ファイルタブでワークツリーを選んでいるとき、作業場所の右に出す）。
 * プッシュして GitHub に PR を作る → GitHub でマージ → 「片付ける」でワークツリーとブランチを消し、本体を最新にする。
 * 右端のごみ箱で、PR の状態にかかわらずワークツリーを消せる（ブランチも消すかを選ぶ）。
 * ワークツリーの実行環境（ポートの帯）があれば［アプリを開く］（埋め込みブラウザで <ブランチ名>.localhost:<帯+00>）と、
 * 分けられない理由・整えきれていない所を出す（押すと中身）。［AI で整える］は、手順で直せなかった所を、このワークツリーの新しいチャット
 * 「実行環境を整える（ブランチ）」の AI に Git で管理していないファイルだけで直してもらう（この機能より前に作ったワークツリーは、先にコアが手順を流す）
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
  const env = useWorktreeEnv(projectId, worktree);
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
  const action = useAction<"create" | "finish" | "remove" | "setup">();
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
    const confirm = {
      title: "ワークツリーを片付けますか？",
      message: `PR がマージされたので、${worktree} のフォルダと、手元のブランチ「${status?.branch ?? ""}」を消します。そのあと本体を最新にします。このワークツリーで作業していたチャットは、続きを本体で進めます。`,
      confirmLabel: "片付ける",
      danger: true,
    };
    // Kickoff が組の名前を割り当てたワークツリーならコンテナとデータも、このワークツリーの DB から作った接続があればそれも消すかを一緒に選ぶ
    const info = await api.worktreeRemovalInfo(projectId, worktree).catch(() => null);
    const { checks, read } = removalChecks(env, info?.db_connections ?? []);
    const answer = checks.length ? await confirmWithChecks({ ...confirm, checks }) : (await confirmDialog(confirm)) && { checked: [] };
    if (!answer) return;
    await action.run("finish", async () => {
      // 片付け = ブランチも消す「消す」（コミットしていない変更があれば、消さずに失敗する）
      await api.removeWorktree(projectId, worktree, { deleteBranch: true, ...read(answer.checked) });
      worktreesStore.invalidate(projectId);
      // 本体を最新にする（手元に変更があってできなければ、そう伝える）
      await api.gitPull(projectId).catch((e: unknown) => void alertDialog("本体を最新にできませんでした", errorMessage(e)));
      onFinished();
    });
  };

  // ［AI で整える］: チャットを作って開く（手順を流したあとの一覧も入れる）
  const setup = () =>
    action.run("setup", async () => {
      const { chat, worktrees } = await api.setupWorktreeEnv(projectId, worktree);
      worktreesStore.set(projectId, worktrees);
      addChat(chat);
      openChat(projectId, chat.id);
    });

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
      {env?.app_url && (
        <button
          className="btn btn-sm"
          data-tip={`${appAddress(env)} をチャット欄のブラウザで開く（開発サーバーは、このワークツリーのターミナルで起動すると PORT=${env.band} で動きます）`}
          onClick={() => panelActions(panelKey("side", projectId)).openBrowser(env.app_url!)}
        >
          <Globe size={12} aria-hidden /> アプリを開く
        </button>
      )}
      {env?.blocked && (
        <button className="btn btn-sm worktree-env-warn" onClick={() => void alertDialog("ポートを分けられません", `${env.blocked}\n\nこのワークツリーは、本体と同じポート・同じ Docker の組の名前のままです。`)}>
          <TriangleAlert size={12} aria-hidden /> ポートを分けられません
        </button>
      )}
      {env && env.issues.length > 0 && (
        <button className="btn btn-sm worktree-env-warn" onClick={() => void alertDialog("整えきれていない所があります", env.issues.map((i) => `・${i}`).join("\n"))}>
          <TriangleAlert size={12} aria-hidden /> 整えきれていない所 {env.issues.length} 件
        </button>
      )}
      <button
        className="btn btn-sm"
        disabled={busy}
        data-tip={
          env
            ? "手順で直せなかった所を、このワークツリーの新しいチャットで AI に直してもらいます（書き換えるのは Git で管理していないファイルだけ）"
            : "このワークツリーのポートの帯と Docker の組の名前を割り当て、残った所を新しいチャットで AI に直してもらいます（書き換えるのは Git で管理していないファイルだけ）"
        }
        onClick={() => void setup()}
      >
        <WandSparkles size={12} aria-hidden /> {action.busy === "setup" ? "準備中…" : "AI で整える"}
      </button>
      <IconButton icon={Trash2} label="ワークツリーを消す" title="このワークツリーを消す（ブランチも消すかを選べます）" disabled={busy} onClick={() => void remove()} />
      <ErrorText message={action.error ?? pr.error} />
    </div>
  );
}
