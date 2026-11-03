import { useEffect, useRef, useState } from "react";
import type { ProjectSummary, Run, RunGroup } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { useChatSearch } from "../../chatSearch";
import { useSharedFlag, useStoredChoice, useStoredFlag, useStoredFlagMap } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { archivedProjects, PROJECT_ORDERS, sidebarOrder, type ProjectOrder } from "../../projectOrder";
import { useProjects } from "../../projectsContext";
import { navigate, routeProjectId, useRoute } from "../../router";
import {
  SIDEBAR_LAYOUT_KEY,
  SIDEBAR_PROJECT_COLLAPSED_PREFIX,
  SIDEBAR_PROJECT_ORDER_KEY,
  SIDEBAR_SHOW_ARCHIVED_PROJECTS_KEY,
  SIDEBAR_WAITING_ONLY_KEY,
} from "../../storageKeys";
import { loadCurrentProject, saveCurrentProject } from "./currentProject";
import { loadLastHashes, saveLastHashes, type LastHashes } from "./lastHashes";
import type { NavLayout } from "./ProjectListHead";
import { useProjectMenu } from "./ProjectMenu";
import { foldAll, useCompactProjects, useCompactRows, useShowArchivedChats, waitingRuns } from "./sidebarFlags";
import { useProjectReorder } from "./useProjectReorder";
import { useWorkspaceSwipe } from "./useWorkspaceSwipe";

/** グループのないプロジェクトに渡す空の一覧（描くたびに作らない） */
export const NO_GROUPS: RunGroup[] = [];

/**
 * サイドバーのプロジェクトの並びの状態と操作（並べ方・並び順・しまったものを出すか・自分待ちだけ・検索・
 * いま選んでいるプロジェクトと切り替え・ショートカット・スワイプ・すべて閉じる / 開く）。表示は ProjectNav（ProjectStack / ProjectSlides）
 */
export function useProjectNav(runs: Record<number, Run[]>) {
  const route = useRoute();
  const { projects } = useProjects();
  const { pending } = useRunStates();
  // 横スライド / 縦並び
  const [layout, changeLayout] = useStoredChoice<NavLayout>(SIDEBAR_LAYOUT_KEY, ["slide", "stack", "rail"], "slide");
  // サイドバーでの並び順（上に固定したもの → ドラッグで並べ替えた順。同じなら作成順）。
  // しまった（アーカイブした）プロジェクトは、下の行の切り替えで出したときだけ、いちばん下に並べる（並べ替えはできない）
  const [showArchived, setShowArchived] = useStoredFlag(SIDEBAR_SHOW_ARCHIVED_PROJECTS_KEY);
  // 最近動いた順: チャット（アーカイブしたものを除く）が最後に動いた時刻。チャットがなければ作った時刻
  const [projectOrder, setProjectOrder] = useStoredChoice<ProjectOrder>(SIDEBAR_PROJECT_ORDER_KEY, PROJECT_ORDERS, "manual");
  const lastActive = (p: ProjectSummary) => (runs[p.id] ?? []).find((r) => !r.archived_at)?.active_at ?? p.created_at;
  const visible = sidebarOrder(projects, projectOrder === "recent" ? lastActive : undefined);
  // 手動の並びのときだけ、ドラッグで並べ替えられる（しまったものは並べ替えない）
  const canReorder = projectOrder === "manual";
  const archived = archivedProjects(projects);
  // 自分待ちだけを出すときは、自分待ちのチャットがあるプロジェクトだけを並べる（チャットの一覧も開いて見せる）
  const [waitingOnly, setWaitingOnly] = useSharedFlag(SIDEBAR_WAITING_ONLY_KEY);
  const [compact] = useCompactRows();
  const [compactProjects] = useCompactProjects();
  const hasWaiting = (p: ProjectSummary) => waitingRuns(runs[p.id] ?? [], pending).length > 0;
  // すべてのプロジェクトをまたぐ検索（縦並びの上の欄）: 一致するチャットがあるプロジェクトだけを並べ、一覧も開いて見せる
  const [searchAll, setSearchAll] = useState("");
  const allSearch = useChatSearch(layout === "stack" ? searchAll : "");
  const [showArchivedChats] = useShowArchivedChats();
  const hasMatch = (p: ProjectSummary) => (runs[p.id] ?? []).some((r) => (!r.archived_at || showArchivedChats) && allSearch.matches(r));
  const base = waitingOnly ? visible.filter(hasWaiting) : showArchived ? [...visible, ...archived] : visible;
  const ordered = allSearch.keyword ? base.filter(hasMatch) : base;
  const isArchived = (id: number) => archived.some((p) => p.id === id);
  // ドラッグでの並べ替え（縦並びのカード・横スライドの丸で共通。しまったものは除く）
  const reorder = useProjectReorder({ ids: visible.map((p) => p.id), canReorder, isArchived });
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
    if (layout === "stack" || routeProject === id) return;
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
  // トラックパッドの 2 本指スワイプ・タッチのドラッグで隣のプロジェクトへ（縦スライドは縦方向で受け取る）
  const swipe = useWorkspaceSwipe({ index, count: ordered.length, go, active: layout !== "stack", axis: layout === "rail" ? "y" : "x" });

  // ショートカット: ⌥⌘← / ⌥⌘→（縦スライドは ↑ / ↓ も）で前後、⌃1〜9 で n 番目
  useWindowEvent("keydown", (e) => {
    // 縦スライドでは ⌥⌘↑ / ⌥⌘↓ でも前後へ
    const prevNext = layout === "rail" ? ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    if (e.metaKey && e.altKey && prevNext.includes(e.key)) {
      e.preventDefault();
      go(index + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1));
    } else if (e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      go(Number(e.key) - 1);
    }
  });

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

  return {
    projects,
    pending,
    layout,
    /** 一覧の上の見出しの行（ProjectListHead）に渡す */
    head,
    /** しまったものを除いた並び / 絞り込みも通した並び（画面に出す順） */
    visible,
    ordered,
    archived,
    isArchived,
    reorder,
    /** 横スライドで表示中のプロジェクトの位置と、位置で切り替える操作 */
    index,
    go,
    swipe,
    waitingOnly,
    setWaitingOnly,
    showArchived,
    setShowArchived,
    searchAll,
    setSearchAll,
    allSearch,
    collapsedMap,
    compact,
    compactProjects,
    projectMenu,
  };
}

export type ProjectNavController = ReturnType<typeof useProjectNav>;
