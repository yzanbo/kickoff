import { Plus } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import type { ChatGroup } from "@shared/groups/types";
import { cx } from "@/foundation/ui/lib/cx";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { NO_CHATS, stateCounts, useChatsWithChildrenByProject } from "@/features/chat/ui";
import { NO_GROUPS } from "@/features/groups/ui";
import { ProjectListHead } from "./ProjectListHead";
import type { ProjectNavController } from "./useProjectNav";
import { WorkspaceDots } from "./WorkspaceDots";
import { WorkspacePage } from "./WorkspacePage";

/**
 * プロジェクトの一覧（layout で出し分ける）:
 * - 縦並び（stack）: 見出しの行・すべてのプロジェクトをまたぐ検索欄・プロジェクトのカードの列・下の「新しいプロジェクト」
 * - スライド: 1 ページ = 1 プロジェクトのチャット一覧で、スワイプ・丸・ショートカットで切り替える。横スライドは丸を下に並べて横にスワイプ、
 *   縦スライド（rail）は丸を左に縦に並べて縦にスワイプする
 * archivedHead（しまったプロジェクトの見出し。縦並びだけ）・waitingEmpty（要対応がないとき）・topInbox（要対応を上にまとめるとき）・selectionBar は ProjectNav が作る
 */
export function ProjectList({
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
  topInbox: ReactNode;
  selectionBar: ReactNode;
}) {
  const { ordered, visible, index, isArchived, reorder, collapsedMap, filterByWaiting, allSearch, showArchived, compact, compactProjects, projectMenu, pending } = nav;
  const stack = nav.layout === "stack";
  const rail = nav.layout === "rail";
  // 丸の角の状態ごとの数は、子チャットも数える（見出しの数・要対応と同じ）
  const counted = useChatsWithChildrenByProject();
  if (stack) {
    // 固定したプロジェクト（並びの先頭にある）と、その後ろの最初のプロジェクト
    const hasPinned = ordered.some((p) => p.pinned && !isArchived(p.id));
    const firstUnpinned = ordered.findIndex((p) => !p.pinned && !isArchived(p.id));
    return (
      <div className={cx("workspaces", compact && "compact", compactProjects && "compact-projects")}>
        <ProjectListHead nav={nav} />
        <div className="search-all">
          <SearchField value={nav.searchAll} onChange={nav.setSearchAll} placeholder="すべてのプロジェクトのチャットを検索" label="すべてのプロジェクトのチャットを検索" />
        </div>
        <div className="workspace-stack">
          {topInbox}
          {ordered.map((p, i) => (
            <Fragment key={p.id}>
              {/* 固定したプロジェクトがあるときは、「固定」と「プロジェクト」の見出しで分ける */}
              {hasPinned && i === 0 && <div className="project-section-label pinned">固定</div>}
              {hasPinned && i === firstUnpinned && <div className="project-section-label">プロジェクト</div>}
              {/* しまったプロジェクトのまとまりの見出し（押して開閉する。初めは閉じている） */}
              {i === visible.length && archivedHead}
              <div className="stack-item" {...reorder.attrsFor(p.id)} {...reorder.dropProps(p.id)}>
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
          {allSearch.keyword && ordered.length === 0 && <p className="empty-note chat-search-empty search-all-empty">「{allSearch.keyword}」に一致するチャットはありません</p>}
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
  const { viewportRef, trackRef, ...swipe } = nav.swipe;
  const switcher = (
    <div className="workspace-switcher" {...swipe.stripHandlers}>
      <WorkspaceDots
        axis={rail ? "y" : "x"}
        projects={ordered}
        index={index}
        countsOf={(id) => stateCounts(counted[id] ?? NO_CHATS, pending)}
        isArchived={isArchived}
        reorder={reorder}
        onGo={nav.go}
        onMenu={projectMenu.open}
        onNewProject={onNewProject}
      />
    </div>
  );
  return (
    <div className={cx("workspaces", rail && "rail", compact && "compact", compactProjects && "compact-projects")}>
      <ProjectListHead nav={nav} />
      {topInbox && <div className="waiting-inbox-slot">{topInbox}</div>}
      <div className="workspace-body">
        {rail && switcher}
        <div className="workspace-viewport" ref={viewportRef} {...swipe.handlers}>
          {waitingEmpty}
          <div className="workspace-track" ref={trackRef}>
            {ordered.map((p, i) => (
              <WorkspacePage
                key={p.id}
                project={p}
                chats={chats[p.id] ?? NO_CHATS}
                groups={groups[p.id] ?? NO_GROUPS}
                hidden={i !== index}
                collapsed={!filterByWaiting && collapsedMap.get(p.id)}
                onCollapsedChange={collapsedMap.set}
              />
            ))}
          </div>
        </div>
      </div>
      {selectionBar}
      {!rail && switcher}
      {projectMenu.element}
    </div>
  );
}
