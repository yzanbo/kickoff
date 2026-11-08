import { useMemo } from "react";
import { navigate } from "@/app/router";
import { useSetting } from "@/hooks/useSetting";
import {
  ALL_PROJECTS_FEED,
  ALL_PROJECTS_SAVED_VIEWS,
  BOARD_ARCHIVE_FILTER,
  BOARD_SORT,
  BOARD_TABLE_HIDDEN,
  GROUP_BOARD_ARCHIVE_FILTER,
  PROJECT_SAVED_VIEWS,
} from "@/lib/storageKeys";
import { useArchiveFilter } from "./archiveFilter";
import { useAllProjectsColumns, useBoardColumns, useGroupsByState } from "./BoardColumnsToggle";
import { useBoardListCompact, useBoardView } from "./BoardHeader";
import { DEFAULT_CHAT_SORT, parseChatSort, sameChatSort } from "./chatSort";
import { activeView, addView, parseSavedViews, removeView, renameView, replaceViewState, type BoardViewState } from "./savedViews";
import { useKanbanLanes } from "./useKanbanFilters";

/**
 * 保存したビュー（全プロジェクトのボードとプロジェクトのボードで別の一覧。プロジェクトのボードの一覧はすべてのプロジェクトで共通）と、いまの見え方・当てる操作。
 * 見え方の設定（表示・段・列の分け方・並び順・表の列・リストの行・アーカイブ）はそれぞれの設定のまま読み書きし、ビューはその組を覚えるだけ。
 * projectId がなければ全プロジェクトのボード。プロジェクトのボードの列の分け方（状態 = カンバン / グループ・グループ×状態 = グループのボード）は
 * 画面が分かれているので、当てるときはその画面へ移る。グループのボードは段がグループだけで、アーカイブの絞り込みも別の設定（GROUP_BOARD_ARCHIVE_FILTER）
 */
export function useSavedViews(projectId?: number) {
  const allProjects = projectId === undefined;
  const [stored, setStored] = useSetting(allProjects ? ALL_PROJECTS_SAVED_VIEWS : PROJECT_SAVED_VIEWS);
  const views = useMemo(() => parseSavedViews(stored), [stored]);

  const { view, split, setView, setSplit } = useBoardView();
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);
  const [columns, setColumns] = useAllProjectsColumns();
  const [rawSort, setSort] = useSetting(BOARD_SORT);
  const [hidden, setHidden] = useSetting(BOARD_TABLE_HIDDEN);
  const [compact, setCompact] = useBoardListCompact();
  const [boardArchive, setBoardArchive] = useArchiveFilter(BOARD_ARCHIVE_FILTER);
  const [groupArchive, setGroupArchive] = useArchiveFilter(GROUP_BOARD_ARCHIVE_FILTER);
  const [feed, setFeed] = useSetting(ALL_PROJECTS_FEED);
  const [byState, setByState] = useGroupsByState();
  const [projectColumns] = useBoardColumns();
  // プロジェクトのグループのボードを見ているか（列の分け方はいまの画面を ProjectPage が覚えたもの）
  const onGroupBoard = !allProjects && projectColumns === "groups";
  const archive = onGroupBoard ? groupArchive : boardArchive;
  const columnsNow = allProjects ? columns : projectColumns;

  const current: BoardViewState = {
    view: allProjects && feed ? "feed" : view,
    // グループのボードの段はグループだけ（段の分け方の設定は使わない）
    lanes: split ? (onGroupBoard ? "group" : lanes) : "none",
    columns: columnsNow === "groups" && byState ? "groupsState" : columnsNow,
    sort: parseChatSort(rawSort) ?? DEFAULT_CHAT_SORT,
    hidden,
    compact,
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
    const toGroups = state.columns === "groups" || state.columns === "groupsState";
    if (toGroups) setByState(state.columns === "groupsState");
    // プロジェクトのボードの列の分け方は画面を移る（前の版で列の分け方なしに保存したビューは、いまの画面のまま）
    const toGroupBoard = !allProjects && (state.columns === undefined ? onGroupBoard : toGroups);
    if (state.lanes === "none") setSplit(false);
    else if (toGroupBoard) {
      // グループのボードの段はグループだけ。ほかの段のビューは段の分け方を覚え直し、段に分ける
      if (state.lanes !== "group" && laneOptions.includes(state.lanes)) setLanes(state.lanes);
      setSplit(true);
    } else if (laneOptions.includes(state.lanes)) {
      setLanes(state.lanes);
      setSplit(true);
    }
    if (allProjects && state.columns) setColumns(state.columns === "groupsState" ? "groups" : state.columns);
    setSort(sameChatSort(state.sort, DEFAULT_CHAT_SORT) ? null : state.sort);
    setHidden(state.hidden);
    setCompact(state.compact);
    (toGroupBoard ? setGroupArchive : setBoardArchive)(state.archive);
    if (!allProjects && state.columns !== undefined && toGroupBoard !== onGroupBoard) navigate({ name: "project", id: projectId, tab: toGroupBoard ? "groups" : "board" });
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
