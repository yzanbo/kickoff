import "./GitHubTab.css";
import { useCallback } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import type { GitHubItem, GitHubListFilter } from "@shared/github/types";
import { githubApi } from "@/features/github/ui/api/github";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { ListDetail } from "@/foundation/ui/kit/layout/ListDetail";
import { useListDetail } from "@/foundation/ui/kit/layout/useListDetail";
import { useWhenVisible } from "./useWhenVisible";
import { cx } from "@/foundation/ui/lib/cx";
import { storage } from "./storage";
import { useChatsLinkedTo } from "@/features/chat/ui";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ListHideButton } from "@/foundation/ui/kit/ListRail";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { GitHubConnectionGate } from "./GitHubConnectionGate";
import { GitHubDetail } from "./GitHubDetail";
import { GitHubFilterBar } from "./GitHubFilterBar";
import { openNewIssue } from "./NewIssueDialog";
import { GitHubItemRow } from "./GitHubItemRow";
import { githubListUrl, githubRepoUrl } from "./githubLinks";
import { useGitHubList } from "./useGitHubList";
import { parseGitHubSelected } from "./openGitHubItem";
import { openInDefaultBrowser } from "@/foundation/ui/external/native";

/** 中身の欄に残したい最小の幅。一覧の幅を足してこれが入らないときは、一覧と中身を切り替えて 1 つずつ出す（チャットの右の欄など。CI のタブも同じ） */
export const DETAIL_MIN_WIDTH = 440;

/** 開いているもの（「issue:12」「pr:5」）を読む */
/**
 * プロジェクトの「GitHub」タブ: 左に issue｜PR の一覧と絞り込み、右に開いたものの中身。
 * 連携先・アカウントはプロジェクトの設定の「GitHub」のとおり。使えなければ（remote がない・gh がない・ログインしていない）理由と直し方を出す
 */
export function GitHubTab({ projectId }: { projectId: number }) {
  return (
    <GitHubConnectionGate
      projectId={projectId}
      icon={GitPullRequest}
      title={(repo) => `${repo} を見られません`}
      note="使うアカウントと連携先のリポジトリは、プロジェクトの設定の「GitHub」で選べます。"
    >
      {({ host, repo }) => <GitHubBrowser projectId={projectId} host={host} repo={repo} />}
    </GitHubConnectionGate>
  );
}

function GitHubBrowser({ projectId, host, repo }: { projectId: number; host: string; repo: string }) {
  const [filters, setFilters] = useSetting(storage.settings.filters(projectId));
  const [selectedText, setSelectedText] = useSetting(storage.settings.selected(projectId));
  const selected = parseGitHubSelected(selectedText);
  const filter = filters[filters.kind];
  const list = useGitHubList(projectId, filter);
  const meta = useQuery(["github.meta", projectId], () => githubApi.githubMeta(projectId));
  // 左の一覧を隠せる（広いときだけ。狭いときは一覧と中身を切り替えて 1 つずつ出す）
  const layout = useListDetail({ width: storage.settings.listWidth, hidden: storage.settings.listHidden, min: 260, keep: 360, detailMin: DETAIL_MIN_WIDTH, hasSelection: !!selected });
  const { narrow } = layout;

  const change = (patch: Partial<GitHubListFilter>) => setFilters({ ...filters, [filter.kind]: { ...filter, ...patch } });
  const open = useCallback((item: GitHubItem) => setSelectedText(`${item.kind}:${item.number}`), [setSelectedText]);
  const page = list.page;
  const moreRef = useWhenVisible<HTMLButtonElement>(list.loadMore, !!page?.cursor && !list.loadingMore && !list.loading, page?.items.length);
  // この一覧のリポジトリの issue・PR に結び付いたチャット（「種類:番号」→ 最近動いた順）
  const linked = useChatsLinkedTo(projectId, repo);

  return (
    <ListDetail
      state={layout}
      className="tool-frame"
      listLabel="issue・PR の一覧を表示"
      list={
        <>
          {/* リポジトリの名前は GitHub のリポジトリのページへ、右の印はいまの絞り込みの一覧を GitHub で開く（外のブラウザ） */}
          <div className="github-list-repo small">
            <a className="github-repo-link" href={githubRepoUrl(host, repo)} target="_blank" rel="noreferrer" data-tip="GitHub でリポジトリを開く">
              {repo}
            </a>
            <IconButton icon={ExternalLink} iconSize={13} label="この一覧を GitHub で開く" onClick={() => openInDefaultBrowser(githubListUrl(host, repo, filter))} />
            {/* 一覧を隠す（右端。狭いときは一覧と中身を切り替えるので出さない） */}
            {!narrow && (
              <>
                <span className="spacer" />
                <ListHideButton size={13} label="issue・PR の一覧を隠す" onHide={layout.hide} />
              </>
            )}
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
          <ErrorText message={list.error ?? errorText(meta.error)} />
          <div className={cx("github-items", list.loading && page && "stale")} aria-busy={list.loading || undefined}>
            {list.loading && page && <div className="github-updating-bar muted small">更新中…</div>}
            {!page && !list.error && <p className="muted small github-items-note">読み込み中…</p>}
            {page && page.items.length === 0 && <p className="muted small github-items-note">当てはまる{filter.kind === "pr" ? " PR" : " issue"}はありません。</p>}
            {page?.items.map((item) => (
              <GitHubItemRow key={item.number} item={item} selected={selected?.number === item.number && selected.kind === item.kind} fresh={list.fresh.has(item.number)} chats={linked.get(`${item.kind}:${item.number}`)} onOpen={open} />
            ))}
            {/* 下まで送ったら続きを読む（見えたら読む。押しても読める） */}
            {page?.cursor && (
              <button ref={moreRef} type="button" className="btn github-more" data-size="sm" disabled={list.loadingMore} onClick={list.loadMore}>
                {list.loadingMore ? "読み込み中…" : `続きを読む（${page.items.length} / ${page.total.toLocaleString()} 件）`}
              </button>
            )}
          </div>
        </>
      }
      detail={
        selected ? (
          <GitHubDetail key={selectedText} projectId={projectId} kind={selected.kind} number={selected.number} onBack={narrow ? () => setSelectedText("") : undefined} />
        ) : (
          <EmptyState icon={GitPullRequest} title="issue・PR を選んでください">
            <p>左の一覧から選ぶと、本文と会話をここに出します。開いている間は 1 分ごとに GitHub から取り直します。</p>
          </EmptyState>
        )
      }
    />
  );
}
