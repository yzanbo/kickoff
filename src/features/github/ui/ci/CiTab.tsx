import { useCallback, useMemo } from "react";
import { ExternalLink, Workflow } from "lucide-react";
import { GITHUB_DEFAULT_HOST } from "@shared/foundation/codeHost";
import type { CiRun } from "@shared/github/ciTypes";
import { api } from "@/foundation/ui/api";
import { useServerEvent } from "@/foundation/ui/api/events";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useNarrowerThan } from "@/foundation/ui/hooks/useNarrowerThan";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { cx } from "@/foundation/ui/lib/cx";
import { storage } from "@/features/github/ui/storage";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ListHideButton, ListRail } from "@/foundation/ui/kit/ListRail";
import { IconButton, RefreshButton } from "@/foundation/ui/kit/IconButton";
import { DETAIL_MIN_WIDTH } from "@/features/github/ui/GitHubTab";
import { githubRepoUrl } from "@/features/github/ui/githubLinks";
import { GITHUB_REFRESH_MS, useGitHubRefresh } from "@/features/github/ui/useGitHubRefresh";
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
  const connection = useQuery(["CiTab.connection", projectId], () => api.githubConnection(projectId), { keepPrevious: true });
  const conn = connection.data;
  if (connection.error) return <div className="github-tab"><ErrorText message={errorText(connection.error)} /></div>;
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
  const [selectedText, setSelectedText] = useSetting(storage.settings.ciSelected(projectId));
  const selected = parseCiSelected(selectedText);
  const list = useQuery(["CiTab.list", projectId], () => api.ciRuns(projectId), { keepPrevious: true });
  const data = list.data;
  const pending = hasPending(data);
  useGitHubRefresh(list.reload, true, pending ? CI_PENDING_REFRESH_MS : GITHUB_REFRESH_MS);
  // 見張りが落ちた実行を見つけたら、一覧も取り直す
  useServerEvent("ci_failed", (e) => {
    if (e.failure.project_id === projectId) list.reload();
  });
  const { paneRef: widthPaneRef, ...width } = useDragSize({ setting: storage.settings.ciListWidth, min: 260, keep: 360 });
  const { ref: root, narrow } = useNarrowerThan<HTMLDivElement>(width.size + DETAIL_MIN_WIDTH);
  const open = useCallback((run: CiRun) => setSelectedText(ciSelectedText(run.id)), [setSelectedText]);
  const watched = useMemo(() => new Set([...(data?.workplace_branches ?? []), ...(data?.default_branch ? [data.default_branch] : [])]), [data]);
  // 左の一覧を隠しているか（広いときだけ効く。狭いときは一覧と中身を切り替えて 1 つずつ出すので、隠さない）
  const [listHidden, setListHidden] = useSetting(storage.settings.ciListHidden);
  const showList = narrow ? !selected : !listHidden;
  const showDetail = !narrow || selected;
  const actionsUrl = `${githubRepoUrl(host, repo)}/actions`;

  return (
    <div ref={root} className={cx("github-tab github-browser ci-tab", narrow && "narrow")}>
      {showList && (
        <aside ref={widthPaneRef} className="github-list" style={narrow ? undefined : { width: width.size }}>
          <div className="github-list-repo small">
            <a className="github-repo-link" href={githubRepoUrl(host, repo)} target="_blank" rel="noreferrer" data-tip="GitHub でリポジトリを開く">
              {repo}
            </a>
            <IconButton icon={ExternalLink} size={13} label="GitHub Actions のページを開く" onClick={() => window.open(actionsUrl, "_blank", "noopener")} />
            {/* 一覧を隠す（右端。狭いときは一覧と中身を切り替えるので出さない） */}
            {!narrow && (
              <>
                <span className="spacer" />
                <ListHideButton size={13} label="実行の一覧を隠す" onHide={() => setListHidden(true)} />
              </>
            )}
          </div>
          <div className="github-filter-bar">
            <div className="github-filter-row">
              <span className="small">GitHub Actions の実行</span>
              <span className="github-filter-count muted small">{data ? `${data.runs.length} 件` : ""}</span>
              <RefreshButton label="GitHub から取り直す" busy={list.loading} onClick={list.reload} />
            </div>
          </div>
          <ErrorText message={errorText(list.error)} />
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
      {!narrow && listHidden && <ListRail label="実行の一覧を表示" onShow={() => setListHidden(false)} />}
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
