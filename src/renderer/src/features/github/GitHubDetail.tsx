import { useState } from "react";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import type { GitHubKind, GitHubPullDetail } from "@shared/types";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { ErrorText } from "@/ui/ErrorText";
import { Segmented } from "@/ui/Segmented";
import { GitHubHtml } from "./GitHubHtml";
import { GitHubChecksList } from "./GitHubChecksList";
import { GitHubLabels, REVIEW_DECISION_LABELS } from "./GitHubItemRow";
import { GitHubStateChip } from "./GitHubStateIcon";
import { GitHubAuthor, GitHubTime, GitHubTimeline } from "./GitHubTimeline";
import { useGitHubDetail, type GitHubDetail as Detail } from "./useGitHubDetail";

/** PR の中身の切り替え */
const PR_VIEWS = ["conversation", "checks"] as const;
type PrView = (typeof PR_VIEWS)[number];
const PR_VIEW_LABELS: Record<PrView, string> = { conversation: "会話", checks: "チェック" };

const isPull = (d: Detail): d is GitHubPullDetail => d.item.kind === "pr";

/**
 * GitHub タブの右（開いた issue・PR の中身）。見出し（題名・状態・作った人・ラベル・担当、PR はブランチ・増減・レビュー・衝突）と、
 * issue は本文と会話の流れ、PR は会話・チェックの切り替え。取り直している間は前の中身に「更新中」の印を出す
 */
export function GitHubDetail({ projectId, kind, number, onBack }: { projectId: number; kind: GitHubKind; number: number; onBack?: () => void }) {
  const detail = useGitHubDetail(projectId, kind, number, true);
  const [view, setView] = useState<PrView>("conversation");
  const data = detail.data;

  return (
    <section className="github-detail" aria-busy={detail.loading || undefined}>
      <header className="github-detail-head">
        <div className="github-detail-tools">
          {onBack && <IconButton icon={ArrowLeft} label="一覧へ戻る" onClick={onBack} />}
          {data && detail.loading && <span className="github-updating muted small">更新中…</span>}
          <span className="github-detail-spacer" />
          <RefreshButton label="GitHub から取り直す" busy={detail.loading} onClick={detail.refresh} />
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
            {(data.item.labels.length > 0 || data.item.assignees.length > 0 || data.item.milestone) && (
              <div className="github-detail-meta">
                <GitHubLabels labels={data.item.labels} />
                {data.item.assignees.length > 0 && <span className="muted small">担当: {data.item.assignees.map((a) => a.login).join("、")}</span>}
                {data.item.milestone && <span className="muted small">マイルストーン: {data.item.milestone}</span>}
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
                options={PR_VIEWS.map((v) => ({ value: v, label: v === "checks" ? `${PR_VIEW_LABELS[v]} ${data.checks.length}` : PR_VIEW_LABELS[v] }))}
              />
            )}
          </>
        )}
      </header>
      <ErrorText message={detail.error ?? undefined} />
      {!data && !detail.error && <p className="muted small github-detail-loading">読み込み中…</p>}
      {data && (
        <div className="github-detail-body">
          {isPull(data) && view === "checks" ? (
            <GitHubChecksList checks={data.checks} />
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
            </>
          )}
        </div>
      )}
    </section>
  );
}
