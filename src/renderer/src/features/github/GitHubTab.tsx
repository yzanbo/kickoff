import { useCallback, useMemo } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { GITHUB_DEFAULT_HOST } from "@shared/github/host";
import type { Chat, GitHubItem, GitHubKind, GitHubListFilter } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useDragSize } from "@/hooks/useDragSize";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { useNarrowSplit } from "@/hooks/useNarrowSplit";
import { useSetting } from "@/hooks/useSetting";
import { useWhenVisible } from "@/hooks/useWhenVisible";
import { cx } from "@/lib/cx";
import { GITHUB_LIST_WIDTH, githubFilters, githubSelected } from "@/lib/storageKeys";
import { useChats } from "@/stores/chats";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { GitHubDetail } from "./GitHubDetail";
import { GitHubFilterBar } from "./GitHubFilterBar";
import { openNewIssue } from "./githubDialogs";
import { GitHubItemRow } from "./GitHubItemRow";
import { githubListUrl, githubRepoUrl } from "./githubLinks";
import { useGitHubList } from "./useGitHubList";

/** 中身の欄に残したい最小の幅。一覧の幅を足してこれが入らないときは、一覧と中身を切り替えて 1 つずつ出す（チャットの右の欄など。CI のタブも同じ） */
export const DETAIL_MIN_WIDTH = 440;

/** 開いているもの（「issue:12」「pr:5」）を読む */
function parseSelected(text: string): { kind: GitHubKind; number: number } | null {
  const m = /^(issue|pr):(\d+)$/.exec(text);
  return m ? { kind: m[1] as GitHubKind, number: Number(m[2]) } : null;
}

/**
 * プロジェクトの「GitHub」タブ（要件 5.11 の段階 1「読む」）: 左に issue｜PR の一覧と絞り込み、右に開いたものの中身。
 * 連携先・アカウントはプロジェクトの設定の「GitHub」のとおり。使えなければ（remote がない・gh がない・ログインしていない）理由と直し方を出す
 */
export function GitHubTab({ projectId }: { projectId: number }) {
  const connection = useAsync(() => api.githubConnection(projectId), [projectId]);
  const conn = connection.data;
  if (connection.error) return <div className="github-tab"><ErrorText message={connection.error} /></div>;
  if (!conn) return <div className="github-tab muted small github-tab-loading">確認中…</div>;
  if (conn.reason)
    return (
      <div className="github-tab">
        <EmptyState
          icon={GitPullRequest}
          title={conn.repo ? `${conn.repo} を見られません` : "GitHub のリポジトリにつながっていません"}
          actions={
            <button type="button" className="btn btn-sm" onClick={connection.reload}>
              もう一度確かめる
            </button>
          }
        >
          <p>{conn.reason}</p>
          <p className="muted small">使うアカウントと連携先のリポジトリは、プロジェクトの設定の「GitHub」で選べます。</p>
        </EmptyState>
      </div>
    );
  return <GitHubBrowser projectId={projectId} host={conn.host ?? GITHUB_DEFAULT_HOST} repo={conn.repo ?? ""} />;
}

function GitHubBrowser({ projectId, host, repo }: { projectId: number; host: string; repo: string }) {
  const [filters, setFilters] = useSetting(githubFilters(projectId));
  const [selectedText, setSelectedText] = useSetting(githubSelected(projectId));
  const selected = parseSelected(selectedText);
  const filter = filters[filters.kind];
  const list = useGitHubList(projectId, filter, true);
  const meta = useKeyedAsync(String(projectId), () => api.githubMeta(projectId));
  const width = useDragSize({ setting: GITHUB_LIST_WIDTH, min: 260, keep: 360 });
  const { ref: root, narrow } = useNarrowSplit<HTMLDivElement>(width.size, DETAIL_MIN_WIDTH);

  const change = (patch: Partial<GitHubListFilter>) => setFilters({ ...filters, [filter.kind]: { ...filter, ...patch } });
  const open = useCallback((item: GitHubItem) => setSelectedText(`${item.kind}:${item.number}`), [setSelectedText]);
  const page = list.page;
  const moreRef = useWhenVisible<HTMLButtonElement>(list.loadMore, !!page?.cursor && !list.loadingMore && !list.loading, page?.items.length);
  // この一覧のリポジトリの issue・PR に結び付いたチャット（「種類:番号」→ 最近動いた順）
  const { chats } = useChats({ projectId });
  const linked = useMemo(() => {
    const map = new Map<string, Chat[]>();
    for (const c of chats) {
      if (c.github_number === null || c.github_kind === null || c.github_repo?.toLowerCase() !== repo.toLowerCase()) continue;
      const key = `${c.github_kind}:${c.github_number}`;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [chats, repo]);
  const showList = !narrow || !selected;
  const showDetail = !narrow || selected;

  return (
    <div ref={root} className={cx("github-tab github-browser", narrow && "narrow")}>
      {showList && (
        <aside ref={width.paneRef} className="github-list" style={narrow ? undefined : { width: width.size }}>
          {/* リポジトリの名前は GitHub のリポジトリのページへ、右の印はいまの絞り込みの一覧を GitHub で開く（外のブラウザ） */}
          <div className="github-list-repo small">
            <a className="github-repo-link" href={githubRepoUrl(host, repo)} target="_blank" rel="noreferrer" data-tip="GitHub でリポジトリを開く">
              {repo}
            </a>
            <IconButton icon={ExternalLink} size={13} label="この一覧を GitHub で開く" onClick={() => window.open(githubListUrl(host, repo, filter), "_blank", "noopener")} />
          </div>
          <GitHubFilterBar
            filter={filter}
            meta={meta.data}
            total={page?.total ?? null}
            loading={list.loading}
            onChange={change}
            onKind={(kind) => setFilters({ ...filters, kind })}
            onRefresh={list.refresh}
            onNewIssue={() =>
              openNewIssue(projectId, {
                // 作ったら issue の一覧に切り替えて、その issue を開く
                onCreated: (n) => {
                  setFilters({ ...filters, kind: "issue" });
                  setSelectedText(`issue:${n}`);
                  list.refresh();
                },
              })
            }
          />
          <ErrorText message={list.error ?? meta.error ?? undefined} />
          <div className={cx("github-items", list.loading && page && "stale")} aria-busy={list.loading || undefined}>
            {list.loading && page && <div className="github-updating-bar muted small">更新中…</div>}
            {!page && !list.error && <p className="muted small github-items-note">読み込み中…</p>}
            {page && page.items.length === 0 && <p className="muted small github-items-note">当てはまる{filter.kind === "pr" ? " PR" : " issue"}はありません。</p>}
            {page?.items.map((item) => (
              <GitHubItemRow key={item.number} item={item} selected={selected?.number === item.number && selected.kind === item.kind} fresh={list.fresh.has(item.number)} chats={linked.get(`${item.kind}:${item.number}`)} onOpen={open} />
            ))}
            {/* 下まで送ったら続きを読む（見えたら読む。押しても読める） */}
            {page?.cursor && (
              <button ref={moreRef} type="button" className="btn btn-sm github-more" disabled={list.loadingMore} onClick={list.loadMore}>
                {list.loadingMore ? "読み込み中…" : `続きを読む（${page.items.length} / ${page.total.toLocaleString()} 件）`}
              </button>
            )}
          </div>
          {!narrow && <div className="pane-resizer github-list-resizer" {...width.handle} />}
        </aside>
      )}
      {showDetail && (
        <div className="github-main">
          {selected ? (
            <GitHubDetail key={selectedText} projectId={projectId} kind={selected.kind} number={selected.number} onBack={narrow ? () => setSelectedText("") : undefined} />
          ) : (
            <EmptyState icon={GitPullRequest} title="issue・PR を選んでください">
              <p>左の一覧から選ぶと、本文と会話をここに出します。開いている間は 1 分ごとに GitHub から取り直します。</p>
            </EmptyState>
          )}
        </div>
      )}
    </div>
  );
}
