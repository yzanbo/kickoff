import { useCallback, useMemo } from "react";
import { ExternalLink, Workflow } from "lucide-react";
import { GITHUB_DEFAULT_HOST } from "@shared/github/host";
import type { CiRun } from "@shared/types";
import { api } from "@/api";
import { useServerEvent } from "@/api/events";
import { useAsync } from "@/hooks/useAsync";
import { useDragSize } from "@/hooks/useDragSize";
import { useNarrowSplit } from "@/hooks/useNarrowSplit";
import { useSetting } from "@/hooks/useSetting";
import { cx } from "@/lib/cx";
import { CI_LIST_WIDTH, ciSelected } from "@/lib/storageKeys";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { DETAIL_MIN_WIDTH } from "@/features/github/GitHubTab";
import { githubRepoUrl } from "@/features/github/githubLinks";
import { GITHUB_REFRESH_MS, useGitHubRefresh } from "@/features/github/useGitHubRefresh";
import { CiRunDetailView } from "./CiRunDetail";
import { CiExternalRow, CiRunRow } from "./CiRunRow";
import { ciSelectedText, hasPending, parseCiSelected } from "./ciView";

/** 動いている実行がある間に取り直す間隔（15 秒。終われば 1 分ごとに戻す） */
export const CI_PENDING_REFRESH_MS = 15_000;

/**
 * プロジェクトの「CI」タブ: 左に GitHub Actions の実行の一覧（PR のない実行も）と外の CI の成否、右に開いた実行の中身（ジョブ・ステップ・ログ）。
 * 連携先・アカウントは GitHub タブと同じ（プロジェクトの設定の「GitHub」）。使えなければ理由と直し方を出す
 */
export function CiTab({ projectId }: { projectId: number }) {
  const connection = useAsync(() => api.githubConnection(projectId), [projectId]);
  const conn = connection.data;
  if (connection.error) return <div className="github-tab"><ErrorText message={connection.error} /></div>;
  if (!conn) return <div className="github-tab muted small github-tab-loading">確認中…</div>;
  if (conn.reason)
    return (
      <div className="github-tab">
        <EmptyState
          icon={Workflow}
          title={conn.repo ? `${conn.repo} の CI を見られません` : "GitHub のリポジトリにつながっていません"}
          actions={
            <button type="button" className="btn btn-sm" onClick={connection.reload}>
              もう一度確かめる
            </button>
          }
        >
          <p>{conn.reason}</p>
          <p className="muted small">CI のタブは、GitHub タブと同じアカウント・連携先のリポジトリの GitHub Actions を読みます。プロジェクトの設定の「GitHub」で選べます。</p>
        </EmptyState>
      </div>
    );
  return <CiBrowser projectId={projectId} host={conn.host ?? GITHUB_DEFAULT_HOST} repo={conn.repo ?? ""} />;
}

function CiBrowser({ projectId, host, repo }: { projectId: number; host: string; repo: string }) {
  const [selectedText, setSelectedText] = useSetting(ciSelected(projectId));
  const selected = parseCiSelected(selectedText);
  const list = useAsync(() => api.ciRuns(projectId), [projectId]);
  const data = list.data;
  const pending = hasPending(data);
  useGitHubRefresh(list.reload, true, pending ? CI_PENDING_REFRESH_MS : GITHUB_REFRESH_MS);
  // 見張りが落ちた実行を見つけたら、一覧も取り直す
  useServerEvent((e) => {
    if (e.type === "ci_failed" && e.failure.project_id === projectId) list.reload();
  });
  const width = useDragSize({ setting: CI_LIST_WIDTH, min: 260, keep: 360 });
  const { ref: root, narrow } = useNarrowSplit<HTMLDivElement>(width.size, DETAIL_MIN_WIDTH);
  const open = useCallback((run: CiRun) => setSelectedText(ciSelectedText(run.id)), [setSelectedText]);
  const watched = useMemo(() => new Set([...(data?.workplace_branches ?? []), ...(data?.default_branch ? [data.default_branch] : [])]), [data]);
  const showList = !narrow || !selected;
  const showDetail = !narrow || selected;
  const actionsUrl = `${githubRepoUrl(host, repo)}/actions`;

  return (
    <div ref={root} className={cx("github-tab github-browser ci-tab", narrow && "narrow")}>
      {showList && (
        <aside ref={width.paneRef} className="github-list" style={narrow ? undefined : { width: width.size }}>
          <div className="github-list-repo small">
            <a className="github-repo-link" href={githubRepoUrl(host, repo)} target="_blank" rel="noreferrer" data-tip="GitHub でリポジトリを開く">
              {repo}
            </a>
            <IconButton icon={ExternalLink} size={13} label="GitHub Actions のページを開く" onClick={() => window.open(actionsUrl, "_blank", "noopener")} />
          </div>
          <div className="github-filter-bar">
            <div className="github-filter-row">
              <span className="small">GitHub Actions の実行</span>
              <span className="github-filter-count muted small">{data ? `${data.runs.length} 件` : ""}</span>
              <RefreshButton label="GitHub から取り直す" busy={list.loading} onClick={list.reload} />
            </div>
          </div>
          <ErrorText message={list.error} />
          <div className={cx("github-items", list.loading && data && "stale")} aria-busy={list.loading || undefined}>
            {list.loading && data && <div className="github-updating-bar muted small">更新中…</div>}
            {!data && !list.error && <p className="muted small github-items-note">読み込み中…</p>}
            {data && data.external.length > 0 && (
              <section className="ci-external" aria-label="外の CI">
                <h3 className="ci-list-heading muted small">外の CI（作業場所・既定のブランチの先頭のコミット）</h3>
                {data.external.map((c) => (
                  <CiExternalRow key={`${c.branch}/${c.name}`} check={c} />
                ))}
                <h3 className="ci-list-heading muted small">GitHub Actions</h3>
              </section>
            )}
            {data && data.runs.length === 0 && <p className="muted small github-items-note">GitHub Actions の実行はまだありません。</p>}
            {data?.runs.map((run) => (
              <CiRunRow key={run.id} run={run} selected={selected?.runId === run.id} watched={run.branch !== null && watched.has(run.branch)} onOpen={open} />
            ))}
          </div>
          {!narrow && <div className="pane-resizer github-list-resizer" {...width.handle} />}
        </aside>
      )}
      {showDetail && (
        <div className="github-main">
          {selected ? (
            <CiRunDetailView
              key={selected.runId}
              projectId={projectId}
              repo={repo}
              runId={selected.runId}
              jobId={selected.jobId}
              defaultBranch={data?.default_branch ?? null}
              onChanged={list.reload}
              onBack={narrow ? () => setSelectedText("") : undefined}
            />
          ) : (
            <EmptyState icon={Workflow} title="実行を選んでください">
              <p>左の一覧から選ぶと、ジョブとステップのログをここに出します。落ちた実行は、落ちたステップを開いて見せます。</p>
              <p className="muted small">動いている実行がある間は 15 秒ごと、ほかは 1 分ごとに GitHub から取り直します。</p>
            </EmptyState>
          )}
        </div>
      )}
    </div>
  );
}
