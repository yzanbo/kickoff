import "./CiTab.css";
import { useCallback, useMemo } from "react";
import { ExternalLink, Workflow } from "lucide-react";
import type { CiRun, CiRunList } from "@shared/github/ciTypes";
import { ciApi } from "@/features/github/ui/api/ci";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { ListDetail } from "@/foundation/ui/kit/layout/ListDetail";
import { useListDetail } from "@/foundation/ui/kit/layout/useListDetail";
import { cx } from "@/foundation/ui/lib/cx";
import { storage } from "@/features/github/ui/storage";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ListHideButton } from "@/foundation/ui/kit/ListRail";
import { IconButton, RefreshButton } from "@/foundation/ui/kit/IconButton";
import { GitHubConnectionGate } from "@/features/github/ui/GitHubConnectionGate";
import { DETAIL_MIN_WIDTH } from "@/features/github/ui/GitHubTab";
import { githubRepoUrl } from "@/features/github/ui/githubLinks";
import { GITHUB_REFRESH_MS, githubRefresh } from "@/features/github/ui/githubRefresh";
import { CiRunDetailView } from "./CiRunDetail";
import { CiExternalRow, CiRunRow } from "./CiRunRow";
import { ciSelectedText, hasPending, parseCiSelected } from "./ciView";
import { openInDefaultBrowser } from "@/foundation/ui/external/native";
import { ExternalAnchor } from "@/foundation/ui/external/ExternalAnchor";

/** 動いている実行がある間に取り直す間隔（15 秒。終われば 1 分ごとに戻す） */
export const CI_PENDING_REFRESH_MS = 15_000;

/**
 * プロジェクトの「CI」タブ: 左に GitHub Actions の実行の一覧（PR のない実行も）と外の CI の成否、右に開いた実行の中身（ジョブ・ステップ・ログ）。
 * 連携先・アカウントは GitHub タブと同じ（プロジェクトの設定の「GitHub」）。使えなければ理由と直し方を出す
 */
export function CiTab({ projectId }: { projectId: number }) {
  return (
    <GitHubConnectionGate
      projectId={projectId}
      icon={Workflow}
      title={(repo) => `${repo} の CI を見られません`}
      note="CI のタブは、GitHub タブと同じアカウント・連携先のリポジトリの GitHub Actions を読みます。プロジェクトの設定の「GitHub」で選べます。"
    >
      {({ host, repo }) => <CiBrowser projectId={projectId} host={host} repo={repo} />}
    </GitHubConnectionGate>
  );
}

function CiBrowser({ projectId, host, repo }: { projectId: number; host: string; repo: string }) {
  const [selectedText, setSelectedText] = useSetting(storage.settings.ciSelected(projectId));
  const selected = parseCiSelected(selectedText);
  const list = useQuery(["CiTab.list", projectId], () => ciApi.ciRuns(projectId), {
    keepPrevious: true,
    // 動いている実行がある間は短く
    ...githubRefresh<CiRunList>((d) => (hasPending(d) ? CI_PENDING_REFRESH_MS : GITHUB_REFRESH_MS)),
    // 見張りが落ちた実行を見つけたら、一覧も取り直す
    refetchOn: { ci_failed: (e) => e.failure.project_id === projectId },
    refetchOnOpen: false,
  });
  const data = list.data;
  // 左の一覧を隠せる（広いときだけ。狭いときは一覧と中身を切り替えて 1 つずつ出す）
  const layout = useListDetail({ width: storage.settings.ciListWidth, hidden: storage.settings.ciListHidden, min: 260, keep: 360, detailMin: DETAIL_MIN_WIDTH, hasSelection: !!selected });
  const { narrow } = layout;
  const open = useCallback((run: CiRun) => setSelectedText(ciSelectedText(run.id)), [setSelectedText]);
  const watched = useMemo(() => new Set([...(data?.workplace_branches ?? []), ...(data?.default_branch ? [data.default_branch] : [])]), [data]);
  const actionsUrl = `${githubRepoUrl(host, repo)}/actions`;

  return (
    <ListDetail
      state={layout}
      className="ci-tab tool-frame"
      listLabel="実行の一覧を表示"
      list={
        <>
          <div className="github-list-repo small">
            <ExternalAnchor className="github-repo-link" href={githubRepoUrl(host, repo)} data-tip="GitHub でリポジトリを開く">
              {repo}
            </ExternalAnchor>
            <IconButton icon={ExternalLink} iconSize={13} label="GitHub Actions のページを開く" onClick={() => openInDefaultBrowser(actionsUrl)} />
            {/* 一覧を隠す（右端。狭いときは一覧と中身を切り替えるので出さない） */}
            {!narrow && (
              <>
                <span className="spacer" />
                <ListHideButton size={13} label="実行の一覧を隠す" onHide={layout.hide} />
              </>
            )}
          </div>
          <div className="github-filter-bar bar">
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
        </>
      }
      detail={
        selected ? (
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
        )
      }
    />
  );
}
