import { Plus } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Run, RunGroup } from "../../../../core/types";
import { cx } from "../../cx";
import { SearchField } from "../SearchField";
import { ProjectListHead } from "./ProjectListHead";
import { NO_GROUPS, type ProjectNavController } from "./useProjectNav";
import { WorkspacePage } from "./WorkspacePage";

/**
 * 縦並び: 見出しの行・すべてのプロジェクトをまたぐ検索欄・プロジェクトのカードの列・下の「新しいプロジェクト」。
 * archivedHead（しまったプロジェクトの見出し）・waitingEmpty（自分待ちがないとき）・selectionBar は ProjectNav が作る
 */
export function ProjectStack({
  nav,
  runs,
  groups,
  onNewProject,
  archivedHead,
  waitingEmpty,
  selectionBar,
}: {
  nav: ProjectNavController;
  runs: Record<number, Run[]>;
  groups: Record<number, RunGroup[]>;
  onNewProject: () => void;
  archivedHead: ReactNode;
  waitingEmpty: ReactNode;
  selectionBar: ReactNode;
}) {
  const { ordered, visible, isArchived, reorder, collapsedMap, waitingOnly, allSearch, showArchived, compact, compactProjects } = nav;
  // 固定したプロジェクト（並びの先頭にある）と、その後ろの最初のプロジェクト
  const hasPinned = ordered.some((p) => p.pinned && !isArchived(p.id));
  const firstUnpinned = ordered.findIndex((p) => !p.pinned && !isArchived(p.id));
  return (
    <div className={cx("workspaces", compact && "compact", compactProjects && "compact-projects")}>
      <ProjectListHead {...nav.head} />
      <div className="search-all">
        <SearchField value={nav.searchAll} onChange={nav.setSearchAll} placeholder="すべてのプロジェクトのチャットを検索" label="すべてのプロジェクトのチャットを検索" />
      </div>
      <div className="workspace-stack">
        {ordered.map((p, i) => (
          <Fragment key={p.id}>
          {/* 固定したプロジェクトがあるときは、「固定」と「プロジェクト」の見出しで分ける（Slack のスターと同じ） */}
          {hasPinned && i === 0 && <div className="project-section-label pinned">固定</div>}
          {hasPinned && i === firstUnpinned && <div className="project-section-label">プロジェクト</div>}
          {/* しまったプロジェクトのまとまりの見出し（押して開閉する。初めは閉じている） */}
          {i === visible.length && archivedHead}
          <div className={cx("stack-item", reorder.classFor(p.id))} {...reorder.dropProps(p.id)}>
            <WorkspacePage
              project={p}
              runs={runs[p.id] ?? []}
              groups={groups[p.id] ?? NO_GROUPS}
              hidden={false}
              collapsed={!waitingOnly && !allSearch.keyword && collapsedMap.get(p.id)}
              onCollapsedChange={collapsedMap.set}
              searchAll={allSearch.keyword}
              headDrag={reorder.handle(p.id)}
            />
          </div>
          </Fragment>
        ))}
        {!showArchived && archivedHead}
        {waitingEmpty}
        {allSearch.keyword && ordered.length === 0 && <p className="chat-search-empty search-all-empty">「{allSearch.keyword}」に一致するチャットはありません</p>}
      </div>
      {selectionBar}
      <div className="workspace-switcher stack">
        <button className="sidebar-new" onClick={onNewProject}>
          <Plus size={14} /> 新しいプロジェクト
        </button>
      </div>
    </div>
  );
}
