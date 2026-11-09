import { useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import { addView, moveView, removeView, renameView, replaceViewState } from "@/lib/namedViews";
import {
  SIDEBAR_CHAT_ORDER,
  SIDEBAR_CHAT_SECTIONS,
  SIDEBAR_COMPACT,
  SIDEBAR_LAYOUT,
  SIDEBAR_PROJECT_COMPACT,
  SIDEBAR_PROJECT_ORDER,
  SIDEBAR_SAVED_VIEWS,
  SIDEBAR_SHOW_ARCHIVED,
  SIDEBAR_SHOW_ARCHIVED_PROJECTS,
  SIDEBAR_VIEW_SELECTED,
  SIDEBAR_WAITING_ONLY,
  SIDEBAR_WAITING_VIEW,
} from "@/lib/storageKeys";
import { activeSidebarView, parseSidebarViews, type SidebarView, type SidebarViewState } from "./sidebarViews";

/**
 * サイドバーのビュー（見出しのタブ・⚙ の窓・設定の画面で共通）と、いまの見え方・当てる操作。
 * 見え方の設定（並べ方・まとめ方など）はそれぞれの設定のまま読み書きし、ビューはその組を覚えるだけ（ボードの保存したビューと同じ）。
 * selected は最後に選んだビュー（⚙ の窓の「上書き」の先。いまの見え方に合うビューがあれば、そちらを選んでいるものとみなす）
 */
export function useSidebarViews() {
  const [stored, setStored] = useSetting(SIDEBAR_SAVED_VIEWS);
  const views = useMemo(() => parseSidebarViews(stored), [stored]);
  const [selectedId, setSelectedId] = useSetting(SIDEBAR_VIEW_SELECTED);

  const [layout, setLayout] = useSetting(SIDEBAR_LAYOUT);
  const [projectOrder, setProjectOrder] = useSetting(SIDEBAR_PROJECT_ORDER);
  const [projectCompact, setProjectCompact] = useSetting(SIDEBAR_PROJECT_COMPACT);
  const [showArchivedProjects, setShowArchivedProjects] = useSetting(SIDEBAR_SHOW_ARCHIVED_PROJECTS);
  const [grouping, setGrouping] = useSetting(SIDEBAR_CHAT_SECTIONS);
  const [chatOrder, setChatOrder] = useSetting(SIDEBAR_CHAT_ORDER);
  const [chatCompact, setChatCompact] = useSetting(SIDEBAR_COMPACT);
  const [showArchivedChats, setShowArchivedChats] = useSetting(SIDEBAR_SHOW_ARCHIVED);
  const [waitingOn, setWaitingOn] = useSetting(SIDEBAR_WAITING_ONLY);
  const [waitingView, setWaitingView] = useSetting(SIDEBAR_WAITING_VIEW);

  const current: SidebarViewState = {
    layout,
    projectOrder,
    projectCompact,
    showArchivedProjects,
    grouping,
    chatOrder,
    chatCompact,
    showArchivedChats,
    waitingOn,
    waitingView,
  };
  const active = activeSidebarView(views, current);
  /** 選んでいるビュー（いまの見え方に合うもの。なければ最後に選んだもの） */
  const selected = active ?? views.find((v) => v.id === selectedId);

  /** 見え方を当てる（それぞれの設定に書き込む） */
  const applyState = (state: SidebarViewState) => {
    setLayout(state.layout);
    setProjectOrder(state.projectOrder);
    setProjectCompact(state.projectCompact);
    setShowArchivedProjects(state.showArchivedProjects);
    setGrouping(state.grouping);
    setChatOrder(state.chatOrder);
    setChatCompact(state.chatCompact);
    setShowArchivedChats(state.showArchivedChats);
    setWaitingOn(state.waitingOn);
    setWaitingView(state.waitingView);
  };

  return {
    views,
    current,
    /** いまの見え方に合う、いちばん前のビュー */
    active,
    selected,
    /** まだ一度もビューを選んでいないか（初めて開いたときに最初のビューを当てる） */
    neverSelected: selectedId === "",
    /** ビューを選ぶ（見え方を当て、上書きの先として覚える） */
    apply: (view: SidebarView) => {
      applyState(view.state);
      setSelectedId(view.id);
    },
    /** いまの見え方に名前を付けて保存する（いちばん後ろに足し、選んでいるものにする）。足したビューを返す */
    save: (name: string, state: SidebarViewState = current): SidebarView => {
      const view = { id: crypto.randomUUID(), name, state };
      setStored(addView(views, view));
      setSelectedId(view.id);
      return view;
    },
    rename: (id: string, name: string) => setStored(renameView(views, id, name)),
    /** いまの見え方で上書きする */
    overwrite: (id: string) => setStored(replaceViewState(views, id, current)),
    /** 中身を変える（設定の画面。そのビューを選んでいれば、いまの見え方にも当てる） */
    update: (id: string, state: SidebarViewState) => {
      setStored(replaceViewState(views, id, state));
      if (selected?.id === id) applyState(state);
    },
    remove: (id: string) => setStored(removeView(views, id)),
    /** ビュー id を target の前・後ろへ動かす（ドラッグ・設定の画面の上下） */
    move: (id: string, target: string, side: "before" | "after") => setStored(moveView(views, id, target, side)),
  };
}

export type SidebarViews = ReturnType<typeof useSidebarViews>;
