import { useCallback, useEffect, useState } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { foldAll, useFolds } from "@/foundation/ui/hooks/useFold";
import { useCommandHandler } from "@/foundation/ui/commands";
import { href, navigate, routeProjectId, useRoute } from "@/foundation/ui/navigation/router";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { projectsSettings, projectsApi, useProjects, useVisibleProjects, loadCurrentProject, saveCurrentProject, useProjectMenu } from "@/features/projects/ui";
import { chatListSettings, projectKey } from "@/features/chatList/ui";
import { waitingChats, useChatStates, useChatSearch, useChatsWithChildrenByProject } from "@/features/chat/ui";
import { useReorder } from "@/foundation/ui/kit/drag/useReorder";
import { ensureAllRows } from "@/foundation/ui/hooks/useProgressiveRows";
import { moveInList } from "@/foundation/ui/lib/moveInList";
import { PROJECT_DRAG_TYPE } from "@/features/chatList/ui";
import { useWorkspaceSwipe } from "./useWorkspaceSwipe";
import { projectMoves } from "./commands";
import { useAllDrafts } from "@/features/chatPanel/ui";

/**
 * サイドバーのプロジェクトの並びの状態と操作（並べ方・並び順・しまったものを出すか・要対応だけ・検索・
 * いま選んでいるプロジェクトと切り替え・ショートカット・スワイプ・すべて閉じる / 開く）。表示は ProjectNav（ProjectList）
 */
export function useProjectNav(chats: Record<number, Chat[]>) {
  const route = useRoute();
  const { projects } = useProjects();
  const { pending } = useChatStates();
  // 横スライド / 縦並び
  const [layout] = useSetting(storage.settings.layout);
  // しまった（アーカイブした）プロジェクトは、下の行の切り替えで出したときだけ、いちばん下に並べる（並べ替えはできない）
  const [showArchived, setShowArchived] = useSetting(storage.settings.showArchivedProjects);
  // サイドバーでの並び順（上に固定したもの → ドラッグで並べ替えた順 / 最近動いた順）と、タグでの絞り込み（見出しの「タグ」。
  // 合わないプロジェクトは、固定・しまったものも含めて出さない）。sorted は絞り込む前のしまっていないもの
  const [projectOrder, setProjectOrder] = useSetting(projectsSettings.listOrder);
  const { active: sorted, visible, archived, tagFilter } = useVisibleProjects();
  // 要対応だけを出すときは、要対応のチャットか、送る前の新しいチャット（下書き）があるプロジェクトだけを並べる（チャットの一覧も開いて見せる）
  const [waitingOnly, setWaitingOnly] = useSetting(storage.settings.waitingOnly);
  // オンのときの出し方 × 並べ方。プロジェクトとチャットを絞るのは「要対応だけ × プロジェクト別」のときだけ
  const [waitingScope] = useSetting(storage.settings.waitingScope);
  const [waitingOrder] = useSetting(storage.settings.waitingOrder);
  const filterByWaiting = waitingOnly && waitingScope === "only" && waitingOrder === "project";
  const [compact] = useSetting(chatListSettings.compact);
  const [compactProjects] = useSetting(chatListSettings.projectCompact);
  const drafts = useAllDrafts();
  // 要対応の数（タグで絞り込んでいれば、出しているプロジェクトの分だけ。しまったプロジェクトは数えない。子チャットも数える）
  const counted = useChatsWithChildrenByProject();
  const waitingCount = visible.reduce((n, p) => n + waitingChats(counted[p.id] ?? [], pending).length, 0);
  const hasWaiting = (p: Project) => waitingChats(counted[p.id] ?? [], pending).length > 0 || drafts.some((d) => d.projectId === p.id);
  // すべてのプロジェクトをまたぐ検索（縦並びの上の欄）: 一致するチャットがあるプロジェクトだけを並べ、一覧も開いて見せる
  const [searchAll, setSearchAll] = useState("");
  const allSearch = useChatSearch(layout === "stack" ? searchAll : "");
  const [showArchivedChats] = useSetting(chatListSettings.showArchived);
  const hasMatch = (p: Project) => (chats[p.id] ?? []).some((r) => (!r.archived_at || showArchivedChats) && allSearch.matches(r));
  const base = filterByWaiting ? visible.filter(hasWaiting) : showArchived ? [...visible, ...archived] : visible;
  const ordered = allSearch.keyword ? base.filter(hasMatch) : base;
  const isArchived = (id: number) => archived.some((p) => p.id === id);
  // ドラッグでの並べ替え（縦並びのカード・横スライドとアイコンの列の丸で共通。しまったものは除く）。
  // タグで絞り込んでいても、隠れたものを含む並び全体の中で動かす（隠れたものの位置を崩さない）。
  // 最近動いた順でも並べ替えられ、落とすと手動の並びに切り替える（見えている並びのまま、動かしたものだけが動く）
  const projectIds = sorted.map((p) => p.id);
  const reorder = useReorder({
    keys: projectIds,
    type: PROJECT_DRAG_TYPE,
    axis: "y",
    sideBy: "order",
    can: (id) => !isArchived(id),
    onStart: ensureAllRows,
    onMove: (from, to, side) => {
      void projectsApi.reorderProjects(moveInList(projectIds, from, to, side) ?? projectIds);
      if (projectOrder !== "manual") setProjectOrder("manual");
    },
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
    if (routeProject !== null) setCurrentId(routeProject);
  }, [routeProject]);

  // プロジェクトごとに、最後に見ていた画面（URL）を覚えておく（横スライドで戻ってきたときに開く。アプリを閉じるまで）
  useEffect(() => {
    if (routeProject === null) return;
    // 新しいチャットの画面は覚えない（戻るたびに新しいチャットが開かないように）
    if (route.name === "newChat") return;
    // URL ではなく画面から作る（サイドバーの別ウィンドウの URL は別ウィンドウの行き先で、画面はメインのウィンドウのもの）
    writeSetting(storage.settings.lastHashByProject, { ...readSetting(storage.settings.lastHashByProject), [routeProject]: href(route) });
  }, [route, routeProject]);

  /** 横スライドで切り替えたプロジェクトを、右側にも表示する */
  const showProject = (id: number) => {
    if (layout === "stack" || routeProject === id) return;
    const hash = readSetting(storage.settings.lastHashByProject)[id];
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

  // ショートカット（コマンドの表は ./commands.ts）: ⌥⌘← / ⌥⌘→（縦スライドは ↑ / ↓ も）・⌃Tab / ⌃⇧Tab で前後、⌃1〜9 で n 番目
  useCommandHandler(projectMoves, (move) => {
    if ("at" in move) return go(move.at);
    if (move.vertical && layout !== "rail") return false;
    if (!move.wrap) return go(index + move.step);
    if (ordered.length > 1) go((index + move.step + ordered.length) % ordered.length);
  });

  // プロジェクトと、その中のまとまりをすべて閉じる・開く（縦並び・横スライドのどちらでも、見出しの行から）
  const allCollapsed = ordered.every((p) => collapsedMap.get(p.id));
  const setAllCollapsed = (on: boolean) => foldAll("sidebar", on);
  return {
    projects,
    pending,
    layout,
    /** すべて閉じる / 開く（一覧の上の見出しの行） */
    fold: { allCollapsed, set: setAllCollapsed },
    /** 要対応の数（⚙ の窓の「要対応」の行） */
    waitingCount,
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
    /** 要対応がオンのときの出し方・並べ方と、プロジェクト・チャットを要対応で絞っているか（要対応だけ × プロジェクト別のとき） */
    waitingScope,
    waitingOrder,
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

/** プロジェクトのドラッグでの並べ替え（縦並びのカード・横スライドとアイコンの列の丸で共通。しまったものはつかめず、落とす先にもならない） */
export type ProjectReorder = ProjectNavController["reorder"];
