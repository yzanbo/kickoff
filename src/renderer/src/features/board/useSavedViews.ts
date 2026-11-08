import { useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import {
  ALL_PROJECTS_FEED,
  ALL_PROJECTS_SAVED_VIEWS,
  BOARD_ARCHIVE_FILTER,
  BOARD_SORT,
  BOARD_TABLE_HIDDEN,
  PROJECT_SAVED_VIEWS,
} from "@/lib/storageKeys";
import { useArchiveFilter } from "./archiveFilter";
import { useAllProjectsColumns, useGroupsByState, useProjectListFlat } from "./BoardColumnsToggle";
import { useBoardView } from "./BoardHeader";
import { DEFAULT_CHAT_SORT, parseChatSort, sameChatSort } from "./chatSort";
import { activeView, addView, parseSavedViews, projectViewState, removeView, renameView, replaceViewState, type BoardViewState } from "./savedViews";
import { useKanbanLanes } from "./useKanbanFilters";

/**
 * 保存したビュー（全プロジェクトのボードとプロジェクトのボードで別の一覧。プロジェクトのボードの一覧はすべてのプロジェクトで共通）と、いまの見え方・当てる操作。
 * 見え方の設定（表示・段・列の分け方・並び順・表の列・アーカイブ）はそれぞれの設定のまま読み書きし、ビューはその組を覚えるだけ。
 * projectId がなければ全プロジェクトのボード。プロジェクトのボードの列はいつも状態で、列の分け方はリストを状態で分けるか（state / none）だけを覚える
 * （以前のグループのボードで保存したビューも、projectViewState で読み替えてそのまま当てる）
 */
export function useSavedViews(projectId?: number) {
  const allProjects = projectId === undefined;
  const [stored, setStored] = useSetting(allProjects ? ALL_PROJECTS_SAVED_VIEWS : PROJECT_SAVED_VIEWS);
  // プロジェクトのボードのビューは、列の分け方をリストの分け方に読み替える（前の版のビューも）
  const views = useMemo(() => {
    const parsed = parseSavedViews(stored);
    return allProjects ? parsed : parsed.map((v) => ({ ...v, state: projectViewState(v.state) }));
  }, [stored, allProjects]);

  const { view, split, setView, setSplit } = useBoardView();
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);
  const [columns, setColumns] = useAllProjectsColumns();
  const [rawSort, setSort] = useSetting(BOARD_SORT);
  const [hidden, setHidden] = useSetting(BOARD_TABLE_HIDDEN);
  const [archive, setArchive] = useArchiveFilter(BOARD_ARCHIVE_FILTER);
  const [feed, setFeed] = useSetting(ALL_PROJECTS_FEED);
  const [byState, setByState] = useGroupsByState();
  const [listFlat, setListFlat] = useProjectListFlat();

  const current: BoardViewState = {
    view: allProjects && feed ? "feed" : view,
    lanes: split ? lanes : "none",
    ...(allProjects
      ? { columns: columns === "groups" && byState ? ("groupsState" as const) : columns }
      : view === "list"
        ? { columns: listFlat ? ("none" as const) : ("state" as const) }
        : {}),
    sort: parseChatSort(rawSort) ?? DEFAULT_CHAT_SORT,
    hidden,
    archive,
  };

  /** ビューの見え方を当てる（そのボードで選べない段の分け方は、段の分け方だけそのまま） */
  const apply = (state: BoardViewState) => {
    if (state.view === "feed") {
      if (allProjects) setFeed(true);
    } else {
      if (allProjects) setFeed(false);
      setView(state.view);
    }
    if (state.lanes === "none") setSplit(false);
    else if (laneOptions.includes(state.lanes)) {
      setLanes(state.lanes);
      setSplit(true);
    }
    if (allProjects && state.columns) {
      if (state.columns === "groups" || state.columns === "groupsState") setByState(state.columns === "groupsState");
      setColumns(state.columns === "groupsState" ? "groups" : state.columns);
    }
    // プロジェクトのボードのリストの分け方（ビューは projectViewState で読み替えてあるので、リストなら state / none のどちらか）
    if (!allProjects && state.view === "list") setListFlat(state.columns === "none");
    setSort(sameChatSort(state.sort, DEFAULT_CHAT_SORT) ? null : state.sort);
    setHidden(state.hidden);
    setArchive(state.archive);
  };

  return {
    views,
    current,
    active: activeView(views, current),
    apply,
    /** いまの見え方に名前を付けて保存する（いちばん後ろに足す） */
    save: (name: string) => setStored(addView(views, { id: crypto.randomUUID(), name, state: current })),
    rename: (id: string, name: string) => setStored(renameView(views, id, name)),
    /** いまの見え方で上書きする */
    overwrite: (id: string) => setStored(replaceViewState(views, id, current)),
    remove: (id: string) => setStored(removeView(views, id)),
  };
}
