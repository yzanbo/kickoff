import { GalleryHorizontal, Plus, Rows3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Approval, ProjectSummary, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { PROJECT_DRAG_TYPE, useReorder } from "../../groups";
import { useStoredChoice } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { initialOf, projectHue } from "../../projectColor";
import { navigate, routeProjectId, type Route } from "../../router";
import { Segmented } from "../Segmented";
import { WorkspacePage } from "./WorkspacePage";
import { loadCurrentProject, saveCurrentProject } from "./currentProject";
import { useSidebarData } from "./useSidebarData";
import { useWorkspaceSwipe } from "./useWorkspaceSwipe";

const LAYOUT_KEY = "kickoff:sidebar-layout";
const LAST_HASH_KEY = "kickoff:last-hash-by-project";
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
  // サイドバーでの並び順（ドラッグで並べ替えた順。同じなら作成順）
  const ordered = [...projects].sort((a, b) => a.position - b.position || a.id - b.id);
  const reorder = useReorder(
    ordered.map((p) => p.id),
    (ids) => void api.reorderProjects(ids),
    PROJECT_DRAG_TYPE,
  );
  /** 並べ替えのドロップ先にする（プロジェクトのアイコン・縦並びの各プロジェクト） */
  const reorderDrop = (id: number) => ({
    onDragOver: (e: React.DragEvent) => void reorder.over(e, id),
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) reorder.leave(id);
    },
    onDrop: (e: React.DragEvent) => void reorder.drop(e, id),
  });
  const [currentId, setCurrentId] = useState(loadCurrentProject);
  const [layout, changeLayout] = useStoredChoice<NavLayout>(LAYOUT_KEY, ["slide", "stack"], "slide");
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

  if (ordered.length === 0) {
    return (
      <div className="workspace-empty">
        <button className="sidebar-new" onClick={onNewProject}>
          <Plus size={14} /> 新しいプロジェクト
        </button>
      </div>
    );
  }

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
    return (
      <div className="workspaces">
        <div className="workspace-stack">
          {ordered.map((p) => (
            <div key={p.id} className={`stack-item ${reorder.classFor(p.id)}`} {...reorderDrop(p.id)}>
              <WorkspacePage
                project={p}
                runs={runs[p.id] ?? []}
                groups={groups[p.id] ?? NO_GROUPS}
                approvals={approvals}
                route={route}
                hidden={false}
                headDrag={reorder.handle(p.id)}
              />
            </div>
          ))}
        </div>
        <div className="workspace-switcher stack">
          <button className="sidebar-new" onClick={onNewProject}>
            <Plus size={14} /> 新しいプロジェクト
          </button>
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
            />
          ))}
        </div>
      </div>

      <div className="workspace-switcher" role="tablist" aria-label="プロジェクトの切り替え">
        {ordered.map((p, i) => {
          const waiting = approvals.some((a) => a.project_id === p.id);
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === index}
              className={`workspace-dot ${i === index ? "active" : ""} ${reorder.classFor(p.id)}`}
              style={{ "--ws-hue": `${projectHue(p.id)}` } as React.CSSProperties}
              title={`${p.name}${i < 9 ? `（⌃${i + 1}）` : ""}（ドラッグで並べ替え）`}
              onClick={() => go(i)}
              draggable
              {...reorder.handle(p.id)}
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
        {layoutToggle}
      </div>
    </div>
  );
}

const NO_GROUPS: RunGroup[] = [];
