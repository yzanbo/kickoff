import { Archive, ChevronsDownUp, ChevronsUpDown, GalleryHorizontal, Plus, Rows3 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Approval, ProjectSummary, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { PROJECT_DRAG_TYPE, useReorder } from "../../groups";
import { useStoredChoice, useStoredFlag, useStoredFlagMap } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { initialOf, projectHue } from "../../projectColor";
import { archivedProjects, sidebarOrder } from "../../projectOrder";
import { navigate, routeProjectId, type Route } from "../../router";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { ProjectMenu } from "../ProjectMenu";
import { Segmented } from "../Segmented";
import { GroupToggle } from "./GroupToggle";
import { WorkspacePage } from "./WorkspacePage";
import { loadCurrentProject, saveCurrentProject } from "./currentProject";
import { useSidebarData } from "./useSidebarData";
import { useWorkspaceSwipe } from "./useWorkspaceSwipe";

const LAYOUT_KEY = "kickoff:sidebar-layout";
const LAST_HASH_KEY = "kickoff:last-hash-by-project";
/** しまった（アーカイブした）プロジェクトもサイドバーの下に出すか（"1" なら出す） */
const SHOW_ARCHIVED_PROJECTS_KEY = "kickoff:sidebar-show-archived-projects";
/** プロジェクトごとの、チャット一覧を閉じているか（"1" なら閉じている） */
const COLLAPSED_PREFIX = "kickoff:collapsed:";
/** slide: 1 プロジェクトずつ横にスライド / stack: すべてのプロジェクトを縦に並べる */
type NavLayout = "slide" | "stack";
interface Props {
  projects: ProjectSummary[];
  approvals: Approval[];
  route: Route;
  onNewProject: () => void;
}

/**
 * Zen Browser のワークスペースのような、プロジェクトごとのサイドバー。
 * 1 ページ = 1 プロジェクトのチャット一覧で、横スワイプ・下部のアイコン・ショートカットで切り替える。
 */
export function ProjectNav({ projects, approvals, route, onNewProject }: Props) {
  // サイドバーでの並び順（上に固定したもの → ドラッグで並べ替えた順。同じなら作成順）。
  // しまった（アーカイブした）プロジェクトは、下の行の切り替えで出したときだけ、いちばん下に並べる（並べ替えはできない）
  const [showArchived, setShowArchived] = useStoredFlag(SHOW_ARCHIVED_PROJECTS_KEY);
  const visible = sidebarOrder(projects);
  const archived = archivedProjects(projects);
  const ordered = showArchived ? [...visible, ...archived] : visible;
  const reorder = useReorder(
    visible.map((p) => p.id),
    (ids) => void api.reorderProjects(ids),
    PROJECT_DRAG_TYPE,
  );
  /** 並べ替えのドロップ先にする（プロジェクトのアイコン・縦並びの各プロジェクト。しまったものは除く） */
  const reorderDrop = (id: number) => (isArchived(id) ? {} : {
    onDragOver: (e: React.DragEvent) => void reorder.over(e, id),
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) reorder.leave(id);
    },
    onDrop: (e: React.DragEvent) => void reorder.drop(e, id),
  });
  const isArchived = (id: number) => archived.some((p) => p.id === id);
  const [currentId, setCurrentId] = useState(loadCurrentProject);
  // 下の丸の右クリックメニュー（上に固定する・しまう）
  const [menu, setMenu] = useState<{ x: number; y: number; project: ProjectSummary } | null>(null);
  const [layout, changeLayout] = useStoredChoice<NavLayout>(LAYOUT_KEY, ["slide", "stack"], "slide");
  // チャット一覧の開閉（縦並びでは、すべてまとめて閉じる・開くこともできる）
  const collapsedMap = useStoredFlagMap(COLLAPSED_PREFIX);
  // すべてのプロジェクトのチャットとグループ（スライドしたときにすぐ見えるように、先に読み込む）
  const { runs, groups } = useSidebarData(ordered);
  const index = Math.max(0, ordered.findIndex((p) => p.id === currentId));
  const current = ordered[index];

  // 開いた画面のプロジェクトにサイドバーも合わせる
  const routeProject = routeProjectId(route);
  useEffect(() => {
    if (routeProject !== undefined) setCurrentId(routeProject);
  }, [routeProject]);

  // プロジェクトごとに、最後に見ていた画面（URL）を覚えておく（横スライドで戻ってきたときに開く）
  const lastHashes = useRef<Record<number, string>>(JSON.parse(sessionStorage.getItem(LAST_HASH_KEY) ?? "{}"));
  useEffect(() => {
    if (routeProject === undefined) return;
    // 新しいチャットの画面は覚えない（戻るたびに新しいチャットが開かないように）
    if (route.name === "newChat") return;
    lastHashes.current[routeProject] = location.hash;
    sessionStorage.setItem(LAST_HASH_KEY, JSON.stringify(lastHashes.current));
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
  const swipe = useWorkspaceSwipe({ index, count: ordered.length, go });
  // 下の丸の列: 選んでいるプロジェクトの丸を、スクロールして見えるところに出す
  const dotsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dotsRef.current?.querySelector(".workspace-dot.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

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
  const archivedHead = archived.length > 0 && (
    <div className="custom-group-head ungrouped archived-projects-head">
      <GroupToggle open={showArchived} onToggle={toggleArchived} icon={Archive} iconSize={12} />
      <button className="custom-group-name ungrouped-name" onClick={toggleArchived}>
        アーカイブしたプロジェクト
      </button>
      <span className="custom-group-count">{archived.length}</span>
    </div>
  );

  /** 横スライド / 縦並びの切り替え（下の行の右端） */
  const layoutToggle = (
    <Segmented
      className="sidebar-layout-toggle"
      label="プロジェクトの並べ方"
      value={layout}
      onChange={changeLayout}
      options={[
        { value: "slide", label: "1 プロジェクトずつ横にスライド", icon: GalleryHorizontal, iconOnly: true },
        { value: "stack", label: "すべてのプロジェクトを縦に並べる", icon: Rows3, iconOnly: true },
      ]}
    />
  );

  if (layout === "stack") {
    const allCollapsed = ordered.every((p) => collapsedMap.get(p.id));
    const allOpen = ordered.every((p) => !collapsedMap.get(p.id));
    const setAllCollapsed = (on: boolean) => ordered.forEach((p) => collapsedMap.set(p.id, on));
    return (
      <div className="workspaces">
        <div className="workspace-stack">
          {ordered.map((p, i) => (
            <Fragment key={p.id}>
            {/* しまったプロジェクトのまとまりの見出し（押して開閉する。初めは閉じている） */}
            {i === visible.length && archivedHead}
            <div className={`stack-item ${isArchived(p.id) ? "" : reorder.classFor(p.id)}`} {...reorderDrop(p.id)}>
              <WorkspacePage
                project={p}
                runs={runs[p.id] ?? []}
                groups={groups[p.id] ?? NO_GROUPS}
                approvals={approvals}
                route={route}
                hidden={false}
                collapsed={collapsedMap.get(p.id)}
                onCollapsedChange={collapsedMap.set}
                headDrag={isArchived(p.id) ? undefined : reorder.handle(p.id)}
              />
            </div>
            </Fragment>
          ))}
          {!showArchived && archivedHead}
        </div>
        <div className="workspace-switcher stack">
          <button className="sidebar-new" onClick={onNewProject}>
            <Plus size={14} /> 新しいプロジェクト
          </button>
          {/* すべてのプロジェクトのチャット一覧を、まとめて閉じる・開く */}
          <div className="stack-fold">
            <IconButton icon={ChevronsDownUp} label="すべてのプロジェクトを閉じる" title="すべて閉じる" disabled={allCollapsed} onClick={() => setAllCollapsed(true)} />
            <IconButton icon={ChevronsUpDown} label="すべてのプロジェクトを開く" title="すべて開く" disabled={allOpen} onClick={() => setAllCollapsed(false)} />
          </div>
          {layoutToggle}
        </div>
      </div>
    );
  }

  return (
    <div className="workspaces">
      <div
        className="workspace-viewport"
        ref={swipe.viewportRef}
        {...swipe.handlers}
      >
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
              collapsed={collapsedMap.get(p.id)}
              onCollapsedChange={collapsedMap.set}
            />
          ))}
        </div>
      </div>

      <div className="workspace-switcher">
        {/* プロジェクトの丸（右の並べ方の切り替えを除いた幅で、真ん中に並べる。入りきらなければ横にスクロール。マウスのホイールでも横に動く） */}
        <div
          ref={dotsRef}
          className="workspace-dots"
          role="tablist"
          aria-label="プロジェクトの切り替え"
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
        {ordered.map((p, i) => {
          const waiting = approvals.some((a) => a.project_id === p.id);
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === index}
              className={cx("workspace-dot", i === index && "active", p.pinned > 0 && "pinned", isArchived(p.id) ? "archived" : reorder.classFor(p.id))}
              style={{ "--ws-hue": `${projectHue(p.id)}` } as React.CSSProperties}
              title={`${p.name}${p.pinned ? "（固定）" : ""}${isArchived(p.id) ? "（アーカイブ済み）" : ""}${i < 9 ? `（⌃${i + 1}）` : ""}（${isArchived(p.id) ? "" : "ドラッグで並べ替え・"}右クリックで固定・アーカイブ）`}
              onClick={() => go(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, project: p });
              }}
              draggable={!isArchived(p.id)}
              {...(isArchived(p.id) ? {} : reorder.handle(p.id))}
              {...reorderDrop(p.id)}
            >
              {initialOf(p.name)}
              {waiting && <span className="workspace-dot-badge" aria-label="回答待ちあり" />}
            </button>
          );
        })}
        <button className="workspace-dot add" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={onNewProject}>
          <Plus size={14} />
        </button>
        </div>
        {/* しまったプロジェクトを丸の列に出す・隠す（しまったものがあるときだけ。初めは隠す） */}
        {archived.length > 0 && (
          <IconButton
            icon={Archive}
            className={cx("archived-projects-toggle", showArchived && "active")}
            label={showArchived ? "アーカイブしたプロジェクトを隠す" : `アーカイブしたプロジェクトを表示（${archived.length}）`}
            aria-pressed={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          />
        )}
        {layoutToggle}
      </div>
      {menu && <ProjectMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

const NO_GROUPS: RunGroup[] = [];
