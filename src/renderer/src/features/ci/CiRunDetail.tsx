import { useState } from "react";
import { ArrowLeft, ExternalLink, GitPullRequest, RotateCcw } from "lucide-react";
import { CI_STATE_LABELS, type CiJob } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { useAsync } from "@/hooks/useAsync";
import { formatDayTime, formatElapsed, relativeTime } from "@/lib/time";
import { CopyButton } from "@/ui/CopyButton";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { showToast } from "@/ui/toast";
import { openGitHubItem } from "@/features/github/GitHubLinkChip";
import { GITHUB_REFRESH_MS, useGitHubRefresh } from "@/features/github/useGitHubRefresh";
import { CiHandoffMenu } from "./CiHandoffMenu";
import { CiJobSection } from "./CiJobLog";
import { CiStateIcon } from "./CiStateIcon";
import { CI_PENDING_REFRESH_MS } from "./CiTab";
import { jobToOpen, runName } from "./ciView";

/** ジョブのかかった時間（終わっていなければ空） */
function jobDuration(job: CiJob): string | null {
  if (!job.started_at || !job.completed_at) return null;
  return formatElapsed(new Date(job.completed_at).getTime() - new Date(job.started_at).getTime());
}

/**
 * 開いた実行の中身: 見出し（題・状態・ワークフロー #番号・ブランチ・PR・コミット）と操作（やり直す・AI に渡す・取り直す・GitHub で開く）、
 * その下にジョブ（落ちたジョブ・指したジョブを開き、中はステップごとに畳んだログ）
 */
export function CiRunDetailView({
  projectId,
  repo,
  runId,
  jobId,
  defaultBranch,
  onChanged,
  onBack,
}: {
  projectId: number;
  repo: string;
  runId: number;
  jobId: number | null;
  defaultBranch: string | null;
  onChanged: () => void;
  onBack?: () => void;
}) {
  const detail = useAsync(() => api.ciRun(projectId, runId), [projectId, runId]);
  const data = detail.data;
  const run = data?.run;
  useGitHubRefresh(detail.reload, true, run?.state === "pending" ? CI_PENDING_REFRESH_MS : GITHUB_REFRESH_MS);
  const action = useAction<"failed" | "all">();
  // 初めに開くジョブ（中身が届いたときに 1 回だけ決める。あとは開閉を利用者に任せる）
  const [opened, setOpened] = useState<Set<number> | null>(null);
  const openJobs = opened ?? (data ? new Set(jobToOpen(data.jobs, jobId) ? [jobToOpen(data.jobs, jobId)!.id] : []) : new Set<number>());
  const toggle = (id: number) => {
    const next = new Set(openJobs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpened(next);
  };
  const rerun = (failed: boolean) =>
    void action.run(failed ? "failed" : "all", async () => {
      await api.ciRerun(projectId, runId, failed);
      showToast(failed ? "失敗したジョブのやり直しを頼みました" : "すべてのジョブのやり直しを頼みました");
      detail.reload();
      onChanged();
    });

  return (
    <section className="github-detail ci-detail" aria-busy={detail.loading || undefined}>
      <header className="github-detail-head">
        <div className="github-detail-tools">
          {onBack && <IconButton icon={ArrowLeft} label="一覧へ戻る" onClick={onBack} />}
          {data && detail.loading && <span className="github-updating muted small">更新中…</span>}
          <span className="github-detail-spacer" />
          {run && run.state === "failure" && (
            <button type="button" className="btn btn-sm" disabled={action.busy !== null} onClick={() => rerun(true)} data-tip="落ちたジョブ（と、それに頼るジョブ）だけを GitHub でやり直す">
              <RotateCcw size={13} aria-hidden /> {action.busy === "failed" ? "頼んでいます…" : "失敗したジョブをやり直す"}
            </button>
          )}
          {run && run.state !== "pending" && (
            <button type="button" className="btn btn-sm" disabled={action.busy !== null} onClick={() => rerun(false)} data-tip="この実行のすべてのジョブを GitHub でやり直す">
              <RotateCcw size={13} aria-hidden /> {action.busy === "all" ? "頼んでいます…" : "すべてやり直す"}
            </button>
          )}
          {run && run.state === "failure" && <CiHandoffMenu projectId={projectId} run={run} repo={repo} defaultBranch={defaultBranch} />}
          <RefreshButton label="GitHub から取り直す" busy={detail.loading} onClick={detail.reload} />
          {run && <CopyButton label="URL をコピー" text={run.url} />}
          {run && <IconButton icon={ExternalLink} label="GitHub で開く" onClick={() => window.open(run.url, "_blank", "noopener")} />}
        </div>
        {run && (
          <>
            <h2 className="github-detail-title">{run.title}</h2>
            <div className="github-detail-meta">
              <span className={`ci-state-chip ci-state-chip-${run.state}`}>
                <CiStateIcon state={run.state} size={13} /> {CI_STATE_LABELS[run.state]}
              </span>
              <span className="small">
                {runName(run)}
                {run.attempt > 1 && <span className="muted">（{run.attempt} 回目の試み）</span>}
              </span>
              {run.branch && <code className="small">{run.branch}</code>}
              <span className="muted small">{run.event}</span>
              <code className="muted small">{run.sha.slice(0, 7)}</code>
              {run.pulls.map((n) => (
                <button key={n} type="button" className="ci-pull-link small" data-tip="GitHub タブでこの PR を開く" onClick={() => openGitHubItem(projectId, { kind: "pr", number: n })}>
                  <GitPullRequest size={12} aria-hidden /> #{n}
                </button>
              ))}
              <span className="muted small" data-tip={formatDayTime(run.created_at)}>
                {run.actor ? `${run.actor} · ` : ""}
                {relativeTime(run.created_at)}
              </span>
            </div>
          </>
        )}
        <ErrorText message={action.error} />
      </header>
      <ErrorText message={detail.error} />
      {!data && !detail.error && <p className="muted small github-detail-loading">読み込み中…</p>}
      {data && (
        <div className="ci-jobs">
          {data.jobs.length === 0 && <p className="muted small ci-jobs-empty">ジョブはまだありません。</p>}
          {data.jobs.map((job) => (
            <CiJobSection
              key={job.id}
              projectId={projectId}
              runId={runId}
              job={job}
              duration={jobDuration(job)}
              open={openJobs.has(job.id)}
              focus={opened === null && openJobs.has(job.id)}
              onToggle={() => toggle(job.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
