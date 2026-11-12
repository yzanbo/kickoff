import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import type { GitHubKind, GitHubPullDetail } from "@shared/types";
import { api } from "@/api";
import { CopyButton } from "@/ui/CopyButton";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { reportFailure } from "@/ui/dialogs";
import { ErrorText } from "@/ui/ErrorText";
import { Segmented } from "@/ui/Segmented";
import { GitHubHtml } from "./GitHubHtml";
import { GitHubChecksList } from "./GitHubChecksList";
import { GitHubPullChanges } from "./GitHubPullChanges";
import { GitHubLabels, REVIEW_DECISION_LABELS } from "./GitHubItemRow";
import { GitHubStateChip } from "./GitHubStateIcon";
import { GitHubAuthor, GitHubTime, GitHubTimeline, ThreadHandoffContext } from "./GitHubTimeline";
import { GitHubHandoffMenu } from "./GitHubHandoffMenu";
import { GitHubCommentBox } from "./GitHubCommentBox";
import { GitHubLabelPicker } from "./GitHubLabelPicker";
import { GitHubPullActions } from "./GitHubPullActions";
import { ThreadActionsContext, type ThreadActions } from "./GitHubThreadActions";
import { fixReviewComments } from "./githubHandoff";
import { linkOf } from "./githubPrompt";
import { useGitHubDetail, type GitHubDetail as Detail } from "./useGitHubDetail";
import { useGitHubBodyActions } from "./useGitHubBodyActions";

/** PR の中身の切り替え */
const PR_VIEWS = ["conversation", "files", "checks"] as const;
type PrView = (typeof PR_VIEWS)[number];
const PR_VIEW_LABELS: Record<PrView, string> = { conversation: "会話", files: "変更", checks: "チェック" };

const isPull = (d: Detail): d is GitHubPullDetail => d.item.kind === "pr";

/**
 * GitHub タブの右（開いた issue・PR の中身）。見出し（題名・状態・作った人・ラベル・担当、PR はブランチ・増減・レビュー・衝突）と、
 * issue は本文と会話の流れ、PR は会話・変更（差分と行のスレッド）・チェックの切り替え。取り直している間は前の中身に「更新中」の印を出す。
 * 書く（段階 3）: 会話の下のコメント欄（閉じる・開き直すも）・ラベル・URL のコピー、PR はチェックアウト・マージ・行のスレッドへの返信と解決・「変更」でのレビュー。
 * 書いたら中身を取り直す
 */
export function GitHubDetail({ projectId, kind, number, onBack }: { projectId: number; kind: GitHubKind; number: number; onBack?: () => void }) {
  const detail = useGitHubDetail(projectId, kind, number, true);
  const [view, setView] = useState<PrView>("conversation");
  const data = detail.data;
  const refresh = detail.refresh;
  // 行のスレッドへの返信と解決（返信・解決済みにするのは人）。したら取り直す
  const threadActions = useMemo<ThreadActions>(
    () => ({
      reply: async (thread, body) => {
        await api.githubReplyThread(projectId, number, thread.id, body);
        refresh();
      },
      resolve: async (thread, resolved) => {
        await api.githubResolveThread(projectId, number, thread.id, resolved);
        refresh();
      },
    }),
    [projectId, number, refresh],
  );
  const setLabels = (labels: string[]) =>
    void api
      .githubSetLabels(projectId, number, labels)
      .then(refresh)
      .catch(reportFailure("ラベルを変えられませんでした"));

  return (
    <section className="github-detail" aria-busy={detail.loading || undefined}>
      <header className="github-detail-head">
        <div className="github-detail-tools">
          {onBack && <IconButton icon={ArrowLeft} label="一覧へ戻る" onClick={onBack} />}
          {data && detail.loading && <span className="github-updating muted small">更新中…</span>}
          <span className="github-detail-spacer" />
          {data && <GitHubHandoffMenu projectId={projectId} detail={data} />}
          <RefreshButton label="GitHub から取り直す" busy={detail.loading} onClick={detail.refresh} />
          {data && <CopyButton label="URL をコピー" text={data.item.url} />}
          {data && <IconButton icon={ExternalLink} label="GitHub で開く" onClick={() => window.open(data.item.url, "_blank", "noopener")} />}
        </div>
        {data && (
          <>
            <h2 className="github-detail-title">
              {data.item.title} <span className="github-detail-number muted">#{data.item.number}</span>
            </h2>
            <div className="github-detail-meta">
              <GitHubStateChip item={data.item} />
              <GitHubAuthor user={data.item.author} />
              <span className="muted small">
                が作成 <GitHubTime iso={data.item.created_at} />
              </span>
              {isPull(data) && (
                <span className="github-branches small">
                  <code>{data.head_owner && data.head_owner !== data.item.url.split("/")[3] ? `${data.head_owner}:` : ""}{data.item.head_ref}</code> → <code>{data.item.base_ref}</code>
                </span>
              )}
              {isPull(data) && (
                <span className="github-diffstat small">
                  <span className="github-add">+{data.additions}</span> <span className="github-del">−{data.deletions}</span>
                  <span className="muted"> · {data.changed_files} ファイル</span>
                </span>
              )}
              {data.item.review_decision && <span className={`github-review github-review-${data.item.review_decision}`}>{REVIEW_DECISION_LABELS[data.item.review_decision]}</span>}
            </div>
            {(data.item.labels.length > 0 || data.item.assignees.length > 0 || data.item.milestone || data.viewer.can_label || isPull(data)) && (
              <div className="github-detail-meta">
                {data.viewer.can_label && <GitHubLabelPicker key={data.item.labels.map((l) => l.name).join("\n")} projectId={projectId} selected={data.item.labels.map((l) => l.name)} onCommit={setLabels} />}
                <GitHubLabels labels={data.item.labels} />
                {data.item.assignees.length > 0 && <span className="muted small">担当: {data.item.assignees.map((a) => a.login).join("、")}</span>}
                {data.item.milestone && <span className="muted small">マイルストーン: {data.item.milestone}</span>}
                {isPull(data) && <GitHubPullActions projectId={projectId} detail={data} onChanged={refresh} />}
              </div>
            )}
            {isPull(data) && data.item.state === "open" && data.mergeable === "conflicting" && (
              <p className="github-conflict small">
                <TriangleAlert size={13} aria-hidden /> base のブランチと衝突しています
              </p>
            )}
            {isPull(data) && (
              <Segmented
                className="segmented github-pr-views"
                label="PR の中身の切り替え"
                value={view}
                onChange={setView}
                options={PR_VIEWS.map((v) => ({ value: v, label: v === "conversation" ? PR_VIEW_LABELS[v] : `${PR_VIEW_LABELS[v]} ${v === "checks" ? data.checks.length : data.changed_files}` }))}
              />
            )}
          </>
        )}
      </header>
      <ErrorText message={detail.error ?? undefined} />
      {!data && !detail.error && <p className="muted small github-detail-loading">読み込み中…</p>}
      {data && (
        <ThreadHandoffContext.Provider value={isPull(data) ? (thread) => void fixReviewComments(projectId, data, linkOf(data), [thread]) : null}>
        <ThreadActionsContext.Provider value={isPull(data) ? threadActions : null}>
        <DetailBody projectId={projectId} detail={data}>
          {isPull(data) && view === "checks" ? (
            <GitHubChecksList checks={data.checks} />
          ) : isPull(data) && view === "files" ? (
            <GitHubPullChanges projectId={projectId} number={number} threads={data.review_threads} version={data.head_sha ?? data.fetched_at} headSha={data.head_sha} onChanged={refresh} />
          ) : (
            <>
              <article className="github-entry github-body">
                <div className="github-entry-head">
                  <GitHubAuthor user={data.item.author} />
                  <GitHubTime iso={data.item.created_at} />
                </div>
                <GitHubHtml html={data.body_html} />
              </article>
              <GitHubTimeline entries={data.timeline} threads={isPull(data) ? data.review_threads : []} truncated={data.timeline_truncated} />
              <GitHubCommentBox key={`${kind}:${number}`} projectId={projectId} detail={data} onChanged={refresh} />
            </>
          )}
        </DetailBody>
        </ThreadActionsContext.Provider>
        </ThreadHandoffContext.Provider>
      )}
    </section>
  );
}

/** 中身の本文の入れ物（本文の中のこのリポジトリの #番号 のリンクは Kickoff の中で開き、選んだ文は右クリックでチャットに追加。useGitHubBodyActions） */
function DetailBody({ projectId, detail, children }: { projectId: number; detail: Detail; children: ReactNode }) {
  const actions = useGitHubBodyActions(projectId, detail);
  return (
    <div className="github-detail-body" onClick={actions.onClick} onContextMenu={actions.onContextMenu}>
      {children}
      {actions.menu}
    </div>
  );
}
