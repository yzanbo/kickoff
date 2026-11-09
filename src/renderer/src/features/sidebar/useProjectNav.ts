import { useCallback, useEffect, useState } from "react";
import type { Project, Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useChatSearch } from "@/features/chat/chatSearch";
import { useSetting } from "@/hooks/useSetting";
import { foldAll, useFolds } from "@/hooks/useFold";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useProjects } from "@/stores/projects";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { navigate, routeProjectId, useRoute } from "@/app/router";
import { readSetting, writeSetting } from "@/lib/storage";
import { SIDEBAR_LAST_HASHES, SIDEBAR_LAYOUT, SIDEBAR_PROJECT_ORDER, SIDEBAR_SHOW_ARCHIVED_PROJECTS, SIDEBAR_WAITING_ONLY } from "@/lib/storageKeys";
import { projectKey } from "@/features/chatList/bucketHeads";
import { loadCurrentProject, saveCurrentProject } from "./currentProject";
import { useProjectMenu } from "@/features/project/ProjectMenu";
import { useAllDrafts } from "@/features/panel/state/panelDrafts";
import { useCompactProjects, useCompactRows, useShowArchivedChats, waitingChats } from "@/features/chatList/chatListFlags";
import { useChatsWithChildrenByProject } from "@/stores/chats";
import { useProjectReorder } from "./useProjectReorder";
import { useWaitingView } from "./waitingView";
import { useWorkspaceSwipe } from "./useWorkspaceSwipe";

/**
 * サイドバーのプロジェクトの並びの状態と操作（並べ方・並び順・しまったものを出すか・要対応だけ・検索・
 * いま選んでいるプロジェクトと切り替え・ショートカット・スワイプ・すべて閉じる / 開く）。表示は ProjectNav（ProjectStack / ProjectSlides）
 */
export function useProjectNav(chats: Record<number, Chat[]>) {
  const route = useRoute();
  const { projects } = useProjects();
  const { pending } = useChatStates();
  // 横スライド / 縦並び
  const [layout, changeLayout] = useSetting(SIDEBAR_LAYOUT);
  // しまった（アーカイブした）プロジェクトは、下の行の切り替えで出したときだけ、いちばん下に並べる（並べ替えはできない）
  const [showArchived, setShowArchived] = useSetting(SIDEBAR_SHOW_ARCHIVED_PROJECTS);
  // サイドバーでの並び順（上に固定したもの → ドラッグで並べ替えた順 / 最近動いた順）と、タグでの絞り込み（見出しの「タグ」。
  // 合わないプロジェクトは、固定・しまったものも含めて出さない）。sorted は絞り込む前のしまっていないもの
  const [projectOrder, setProjectOrder] = useSetting(SIDEBAR_PROJECT_ORDER);
  const { active: sorted, visible, archived, tagFilter } = useVisibleProjects();
  // 要対応だけを出すときは、要対応のチャットか、送る前の新しいチャット（下書き）があるプロジェクトだけを並べる（チャットの一覧も開いて見せる）
  const [waitingOnly, setWaitingOnly] = useSetting(SIDEBAR_WAITING_ONLY);
  // オンのときの表示（プロジェクトで絞る / 上にまとめる / 1 列にまとめる）。プロジェクトとチャットを絞るのは「絞る」のときだけ
  const [waitingView, setWaitingView] = useWaitingView();
  const filterByWaiting = waitingOnly && waitingView === "filter";
  const [compact] = useCompactRows();
  const [compactProjects] = useCompactProjects();
  const drafts = useAllDrafts();
  // 要対応の数（タグで絞り込んでいれば、出しているプロジェクトの分だけ。しまったプロジェクトは数えない。子チャットも数える）
  const counted = useChatsWithChildrenByProject();
  const waitingCount = visible.reduce((n, p) => n + waitingChats(counted[p.id] ?? [], pending).length, 0);
  const hasWaiting = (p: Project) => waitingChats(counted[p.id] ?? [], pending).length > 0 || drafts.some((d) => d.projectId === p.id);
  // すべてのプロジェクトをまたぐ検索（縦並びの上の欄）: 一致するチャットがあるプロジェクトだけを並べ、一覧も開いて見せる
  const [searchAll, setSearchAll] = useState("");
  const allSearch = useChatSearch(layout === "stack" ? searchAll : "");
  const [showArchivedChats] = useShowArchivedChats();
  const hasMatch = (p: Project) => (chats[p.id] ?? []).some((r) => (!r.archived_at || showArchivedChats) && allSearch.matches(r));
  const base = filterByWaiting ? visible.filter(hasWaiting) : showArchived ? [...visible, ...archived] : visible;
  const ordered = allSearch.keyword ? base.filter(hasMatch) : base;
  const isArchived = (id: number) => archived.some((p) => p.id === id);
  // ドラッグでの並べ替え（縦並びのカード・横スライドとアイコンの列の丸で共通。しまったものは除く）。
  // タグで絞り込んでいても、隠れたものを含む並び全体の中で動かす（隠れたものの位置を崩さない）。
  // 最近動いた順でも並べ替えられ、落とすと手動の並びに切り替える（見えている並びのまま、動かしたものだけが動く）
  const reorder = useProjectReorder({
    ids: sorted.map((p) => p.id),
    isArchived,
    onManual: projectOrder === "manual" ? undefined : () => setProjectOrder("manual"),
  });
  const [currentId, setCurrentId] = useState(loadCurrentProject);
  // 下の丸の右クリックメニュー（プロジェクトに対する操作）
  const projectMenu = useProjectMenu(projects);
  // チャット一覧の開閉（プロジェクトのまとまりのキーで覚える。見出しの行の「すべて閉じる / 開く」でそろえる）。set は参照が変わらない（memo したページに渡す）
  const projectFolds = useFolds(
    "sidebar",
    ordered.map((p) => projectKey(p.id)),
  );
  const { set: setProjectOpen } = projectFolds;
  const setCollapsed = useCallback((id: number, collapsed: boolean) => setProjectOpen(projectKey(id), !collapsed), [setProjectOpen]);
  const collapsedMap = { get: (id: number) => !projectFolds.isOpen(projectKey(id)), set: setCollapsed };
  const index = Math.max(0, ordered.findIndex((p) => p.id === currentId));
  const current = ordered[index];

  // 開いた画面のプロジェクトにサイドバーも合わせる
  const routeProject = routeProjectId(route);
  useEffect(() => {
    if (routeProject !== undefined) setCurrentId(routeProject);
  }, [routeProject]);

  // プロジェクトごとに、最後に見ていた画面（URL）を覚えておく（横スライドで戻ってきたときに開く。アプリを閉じるまで）
  useEffect(() => {
    if (routeProject === undefined) return;
    // 新しいチャットの画面は覚えない（戻るたびに新しいチャットが開かないように）
    if (route.name === "newChat") return;
    writeSetting(SIDEBAR_LAST_HASHES, { ...readSetting(SIDEBAR_LAST_HASHES), [routeProject]: location.hash });
  }, [route, routeProject]);

  /** 横スライドで切り替えたプロジェクトを、右側にも表示する（Arc・Zen Browser のスペースと同じ） */
  const showProject = (id: number) => {
    if (layout === "stack" || routeProject === id) return;
    const hash = readSetting(SIDEBAR_LAST_HASHES)[id];
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

  // ショートカット: ⌥⌘← / ⌥⌘→（縦スライドは ↑ / ↓ も）・⌃Tab / ⌃⇧Tab で前後、⌃1〜9 で n 番目
  useWindowEvent("keydown", (e) => {
    // チャットの中の ⌘⌥↑ / ↓（前後の指示へ）など、先に扱ったキーは見ない
    if (e.defaultPrevented) return;
    // ⌃Tab で次、⌃⇧Tab で前（ブラウザのタブと同じく、端まで来たら反対の端へ回る）
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === "Tab") {
      e.preventDefault();
      if (ordered.length > 1) go((index + (e.shiftKey ? -1 : 1) + ordered.length) % ordered.length);
      return;
    }
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
  const setAllCollapsed = (on: boolean) => foldAll("sidebar", on);
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
    // 要対応の行（オン / オフ・数・オンのときの表示。オフでも行は出し、表示の 2 つは薄くする）
    waiting: { on: waitingOnly, onToggle: () => setWaitingOnly(!waitingOnly), count: waitingCount, view: waitingView, onView: setWaitingView },
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
    /** 要対応がオンのときの表示と、プロジェクト・チャットを要対応で絞っているか（表示が「絞る」のとき） */
    waitingView,
    filterByWaiting,
    tagFilter,
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
