import { Archive, Plus } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Approval, ProjectSummary, Run, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { PROJECT_DRAG_TYPE, useReorder } from "../../groups";
import { useSharedFlag, useStoredChoice, useStoredFlag, useStoredFlagMap } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { archivedProjects, PROJECT_ORDERS, sidebarOrder, type ProjectOrder } from "../../projectOrder";
import { useProjects } from "../../projectsContext";
import { navigate, routeProjectId, type Route } from "../../router";
import {
  SIDEBAR_LAYOUT_KEY,
  SIDEBAR_PROJECT_COLLAPSED_PREFIX,
  SIDEBAR_PROJECT_ORDER_KEY,
  SIDEBAR_SHOW_ARCHIVED_PROJECTS_KEY,
  SIDEBAR_WAITING_ONLY_KEY,
} from "../../storageKeys";
import { cx } from "../../cx";
import { GroupToggle } from "./GroupToggle";
import { ProjectListHead, type NavLayout } from "./ProjectListHead";
import { useProjectMenu } from "./ProjectMenu";
import { WorkspaceDots } from "./WorkspaceDots";
import { useChatSelection } from "./chatSelection";
import { SelectionBar } from "./SelectionBar";
import { WorkspacePage } from "./WorkspacePage";
import { loadCurrentProject, saveCurrentProject } from "./currentProject";
import { loadLastHashes, saveLastHashes, type LastHashes } from "./lastHashes";
import { foldAll, stateCounts, useCompactProjects, useCompactRows, useShowArchivedChats, waitingRuns } from "./sidebarFlags";
import { useChatSearch } from "../../chatSearch";
import { SearchField } from "../SearchField";
import { useWorkspaceSwipe } from "./useWorkspaceSwipe";

interface Props {
  approvals: Approval[];
  /** プロジェクトごとのチャット（アーカイブしたものも含む）とグループ（useSidebarData） */
  runs: Record<number, Run[]>;
  groups: Record<number, RunGroup[]>;
  route: Route;
  onNewProject: () => void;
}

/**
 * Zen Browser のワークスペースのような、プロジェクトごとのサイドバー。
 * 1 ページ = 1 プロジェクトのチャット一覧で、横スワイプ・下部のアイコン・ショートカットで切り替える。
 */
export function ProjectNav({ approvals, runs, groups, route, onNewProject }: Props) {
  const { projects } = useProjects();
  // 横スライド / 縦並び
  const [layout, changeLayout] = useStoredChoice<NavLayout>(SIDEBAR_LAYOUT_KEY, ["slide", "stack"], "slide");
  // サイドバーでの並び順（上に固定したもの → ドラッグで並べ替えた順。同じなら作成順）。
  // しまった（アーカイブした）プロジェクトは、下の行の切り替えで出したときだけ、いちばん下に並べる（並べ替えはできない）
  const [showArchived, setShowArchived] = useStoredFlag(SIDEBAR_SHOW_ARCHIVED_PROJECTS_KEY);
  // 最近動いた順: チャット（アーカイブしたものを除く）が最後に動いた時刻。チャットがなければ作った時刻
  const [projectOrder, setProjectOrder] = useStoredChoice<ProjectOrder>(SIDEBAR_PROJECT_ORDER_KEY, PROJECT_ORDERS, "manual");
  const lastActive = (p: ProjectSummary) => (runs[p.id] ?? []).find((r) => !r.archived_at)?.updated_at ?? p.created_at;
  const visible = sidebarOrder(projects, projectOrder === "recent" ? lastActive : undefined);
  // 手動の並びのときだけ、ドラッグで並べ替えられる（しまったものは並べ替えない）
  const canReorder = projectOrder === "manual";
  const archived = archivedProjects(projects);
  // 自分待ちだけを出すときは、自分待ちのチャットがあるプロジェクトだけを並べる（チャットの一覧も開いて見せる）
  const [waitingOnly, setWaitingOnly] = useSharedFlag(SIDEBAR_WAITING_ONLY_KEY);
  const [compact] = useCompactRows();
  const [compactProjects] = useCompactProjects();
  const hasWaiting = (p: ProjectSummary) => waitingRuns(runs[p.id] ?? [], approvals).length > 0;
  // すべてのプロジェクトをまたぐ検索（縦並びの上の欄）: 一致するチャットがあるプロジェクトだけを並べ、一覧も開いて見せる
  const [searchAll, setSearchAll] = useState("");
  const allSearch = useChatSearch(layout === "stack" ? searchAll : "");
  const [showArchivedChats] = useShowArchivedChats();
  const hasMatch = (p: ProjectSummary) => (runs[p.id] ?? []).some((r) => (!r.archived_at || showArchivedChats) && allSearch.matches(r));
  const base = waitingOnly ? visible.filter(hasWaiting) : showArchived ? [...visible, ...archived] : visible;
  const ordered = allSearch.keyword ? base.filter(hasMatch) : base;
  const reorder = useReorder(
    visible.map((p) => p.id),
    (ids) => void api.reorderProjects(ids),
    PROJECT_DRAG_TYPE,
  );
  /** 並べ替えのドロップ先にする（プロジェクトのアイコン・縦並びの各プロジェクト。しまったものは除く） */
  const reorderDrop = (id: number) => (!canReorder || isArchived(id) ? {} : {
    onDragOver: (e: React.DragEvent) => void reorder.over(e, id),
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) reorder.leave(id);
    },
    onDrop: (e: React.DragEvent) => void reorder.drop(e, id),
  });
  const isArchived = (id: number) => archived.some((p) => p.id === id);
  const [currentId, setCurrentId] = useState(loadCurrentProject);
  // 下の丸の右クリックメニュー（プロジェクトに対する操作）
  const projectMenu = useProjectMenu(projects);
  // チャット一覧の開閉（縦並びでは、すべてまとめて閉じる・開くこともできる）
  const collapsedMap = useStoredFlagMap(SIDEBAR_PROJECT_COLLAPSED_PREFIX);
  const index = Math.max(0, ordered.findIndex((p) => p.id === currentId));
  const current = ordered[index];

  // 開いた画面のプロジェクトにサイドバーも合わせる
  const routeProject = routeProjectId(route);
  useEffect(() => {
    if (routeProject !== undefined) setCurrentId(routeProject);
  }, [routeProject]);

  // プロジェクトごとに、最後に見ていた画面（URL）を覚えておく（横スライドで戻ってきたときに開く）
  const lastHashes = useRef<LastHashes>(loadLastHashes());
  useEffect(() => {
    if (routeProject === undefined) return;
    // 新しいチャットの画面は覚えない（戻るたびに新しいチャットが開かないように）
    if (route.name === "newChat") return;
    lastHashes.current[routeProject] = location.hash;
    saveLastHashes(lastHashes.current);
  }, [route, routeProject]);

  /** 横スライドで切り替えたプロジェクトを、右側にも表示する（Arc・Zen Browser のスペースと同じ） */
  const showProject = (id: number) => {
    if (layout !== "slide" || routeProject === id) return;
    const hash = lastHashes.current[id];
    if (hash) location.hash = hash;
    else navigate({ name: "project", id, tab: "board" });
  };

  useEffect(() => {
    if (current) saveCurrentProject(current.id);
  }, [current]);

  // 縦並びでは、選んだプロジェクト（ショートカット・開いた画面）が見えるところまでスクロールする
  useEffect(() => {
    if (layout !== "stack" || !current) return;
    document.querySelector(`.workspace-stack [data-project-id="${current.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [layout, current]);

  const go = (to: number) => {
    const target = ordered[Math.min(Math.max(to, 0), ordered.length - 1)];
    if (!target) return;
    setCurrentId(target.id);
    showProject(target.id);
  };
  // トラックパッドの 2 本指スワイプ・タッチのドラッグで隣のプロジェクトへ
  const swipe = useWorkspaceSwipe({ index, count: ordered.length, go, active: layout === "slide" });

  // ショートカット: ⌥⌘← / ⌥⌘→ で前後、⌃1〜9 で n 番目
  useWindowEvent("keydown", (e) => {
    if (e.metaKey && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      go(index + (e.key === "ArrowRight" ? 1 : -1));
    } else if (e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      go(Number(e.key) - 1);
    }
  });

  // すべてしまっているときは、下の行（しまったものを出す切り替え）を出す
  // 複数選んだチャットをまとめて操作する欄（選んでいるときだけ、下の行の上に出す）。hooks は、下の早い return より前に呼ぶ
  const selection = useChatSelection();

  if (projects.length === 0) {
    return (
      <div className="workspace-empty">
        <button className="sidebar-new" onClick={onNewProject}>
          <Plus size={14} /> 新しいプロジェクト
        </button>
      </div>
    );
  }

  /** 縦並びの、しまったプロジェクトのまとまりの見出し（サイドバーのアーカイブ済みのチャットと同じ形） */
  const toggleArchived = () => setShowArchived(!showArchived);
  const archivedHead = archived.length > 0 && !waitingOnly && (
    <div className="custom-group-head ungrouped archived-projects-head">
      <GroupToggle open={showArchived} onToggle={toggleArchived} icon={Archive} iconSize={12} />
      <button className="custom-group-name ungrouped-name" onClick={toggleArchived}>
        アーカイブしたプロジェクト
      </button>
      <span className="custom-group-count">{archived.length}</span>
    </div>
  );

  /** 自分待ちだけを出していて、ひとつもないとき */
  const waitingEmpty = waitingOnly && ordered.length === 0 && (
    <div className="waiting-empty">
      <p className="chat-search-empty">自分待ちのチャットはありません</p>
      <button className="chat-row ghost" onClick={() => setWaitingOnly(false)}>
        すべてのチャットを表示
      </button>
    </div>
  );

  const selectionBar = selection && <SelectionBar selection={selection} runs={runs} groups={groups} />;

  // プロジェクトと、その中のまとまりをすべて閉じる・開く（縦並び・横スライドのどちらでも、見出しの行から）
  const allCollapsed = ordered.every((p) => collapsedMap.get(p.id));
  const setAllCollapsed = (on: boolean) => {
    ordered.forEach((p) => collapsedMap.set(p.id, on));
    foldAll(on);
  };
  /** 一覧の上の見出しの行に渡す（並べ方・しまったプロジェクトを出すか・すべて閉じる / 開く） */
  const head = {
    layout,
    onLayout: changeLayout,
    order: projectOrder,
    onOrder: setProjectOrder,
    archivedCount: archived.length,
    showArchived,
    onShowArchived: setShowArchived,
    fold: { allCollapsed, set: setAllCollapsed },
  };

  if (layout === "stack") {
    // 固定したプロジェクト（並びの先頭にある）と、その後ろの最初のプロジェクト
    const hasPinned = ordered.some((p) => p.pinned > 0 && !isArchived(p.id));
    const firstUnpinned = ordered.findIndex((p) => !p.pinned && !isArchived(p.id));
    return (
      <div className={cx("workspaces", compact && "compact", compactProjects && "compact-projects")}>
        <ProjectListHead {...head} />
        <div className="search-all">
          <SearchField value={searchAll} onChange={setSearchAll} placeholder="すべてのプロジェクトのチャットを検索" label="すべてのプロジェクトのチャットを検索" />
        </div>
        <div className="workspace-stack">
          {ordered.map((p, i) => (
            <Fragment key={p.id}>
            {/* 固定したプロジェクトがあるときは、「固定」と「プロジェクト」の見出しで分ける（Slack のスターと同じ） */}
            {hasPinned && i === 0 && <div className="project-section-label pinned">固定</div>}
            {hasPinned && i === firstUnpinned && <div className="project-section-label">プロジェクト</div>}
            {/* しまったプロジェクトのまとまりの見出し（押して開閉する。初めは閉じている） */}
            {i === visible.length && archivedHead}
            <div className={cx("stack-item", !canReorder || isArchived(p.id) ? "" : reorder.classFor(p.id))} {...reorderDrop(p.id)}>
              <WorkspacePage
                project={p}
                runs={runs[p.id] ?? []}
                groups={groups[p.id] ?? NO_GROUPS}
                approvals={approvals}
                route={route}
                hidden={false}
                collapsed={!waitingOnly && !allSearch.keyword && collapsedMap.get(p.id)}
                onCollapsedChange={collapsedMap.set}
                searchAll={allSearch.keyword}
                headDrag={!canReorder || isArchived(p.id) ? undefined : reorder.handle(p.id)}
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

  return (
    <div className={cx("workspaces", compact && "compact", compactProjects && "compact-projects")}>
      <ProjectListHead {...head} />
      <div
        className="workspace-viewport"
        ref={swipe.viewportRef}
        {...swipe.handlers}
      >
        {waitingEmpty}
        <div className="workspace-track" ref={swipe.trackRef}>
          {ordered.map((p, i) => (
            <WorkspacePage
              key={p.id}
              project={p}
              runs={runs[p.id] ?? []}
              groups={groups[p.id] ?? NO_GROUPS}
              approvals={approvals}
              route={route}
              hidden={i !== index}
              collapsed={!waitingOnly && collapsedMap.get(p.id)}
              onCollapsedChange={collapsedMap.set}
            />
          ))}
        </div>
      </div>

      {selectionBar}
      <div className="workspace-switcher">
        <WorkspaceDots
          projects={ordered}
          index={index}
          countsOf={(id) => stateCounts(runs[id] ?? [], approvals)}
          canReorder={canReorder}
          isArchived={isArchived}
          reorder={reorder}
          reorderDrop={reorderDrop}
          onGo={go}
          onMenu={projectMenu.open}
          onNewProject={onNewProject}
        />
      </div>
      {projectMenu.element}
    </div>
  );
}

const NO_GROUPS: RunGroup[] = [];
