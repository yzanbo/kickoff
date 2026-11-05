import { Plus } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Chat, ChatGroup } from "@shared/types";
import { cx } from "@/lib/cx";
import { SearchField } from "@/ui/SearchField";
import { ProjectListHead } from "./ProjectListHead";
import type { ProjectNavController } from "./useProjectNav";
import { WorkspacePage } from "./WorkspacePage";
import { NO_CHATS } from "@/stores/chats";
import { NO_GROUPS } from "@/stores/groups";

/**
 * 縦並び: 見出しの行・すべてのプロジェクトをまたぐ検索欄・プロジェクトのカードの列・下の「新しいプロジェクト」。
 * archivedHead（しまったプロジェクトの見出し）・waitingEmpty（自分待ちがないとき）・selectionBar は ProjectNav が作る
 */
export function ProjectStack({
  nav,
  chats,
  groups,
  onNewProject,
  archivedHead,
  waitingEmpty,
  topInbox,
  selectionBar,
}: {
  nav: ProjectNavController;
  chats: Record<number, Chat[]>;
  groups: Record<number, ChatGroup[]>;
  onNewProject: () => void;
  archivedHead: ReactNode;
  waitingEmpty: ReactNode;
  /** 自分待ちを上にまとめる表示のとき、プロジェクトの一覧の上に置くまとまり */
  topInbox: ReactNode;
  selectionBar: ReactNode;
}) {
  const { ordered, visible, isArchived, reorder, collapsedMap, filterByWaiting, allSearch, showArchived, compact, compactProjects } = nav;
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
        {topInbox}
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
              chats={chats[p.id] ?? NO_CHATS}
              groups={groups[p.id] ?? NO_GROUPS}
              hidden={false}
              collapsed={!filterByWaiting && !allSearch.keyword && collapsedMap.get(p.id)}
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
