import { useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import { ALL_PROJECTS_SAVED_VIEWS, BOARD_ARCHIVE_FILTER, BOARD_SORT, BOARD_TABLE_HIDDEN, PROJECT_SAVED_VIEWS } from "@/lib/storageKeys";
import { useArchiveFilter } from "./archiveFilter";
import { useAllProjectsColumns } from "./BoardColumnsToggle";
import { useBoardListCompact, useBoardView } from "./BoardHeader";
import { DEFAULT_CHAT_SORT, parseChatSort, sameChatSort } from "./chatSort";
import { activeView, addView, parseSavedViews, removeView, renameView, replaceViewState, type BoardViewState } from "./savedViews";
import { useKanbanLanes } from "./useKanbanFilters";

/**
 * 保存したビュー（全プロジェクトのボードとプロジェクトのボードで別の一覧）と、いまの見え方・当てる操作。
 * 見え方の設定（表示・段・列の分け方・並び順・表の列・リストの行・アーカイブ）はそれぞれの設定のまま読み書きし、ビューはその組を覚えるだけ
 */
export function useSavedViews(allProjects: boolean) {
  const [stored, setStored] = useSetting(allProjects ? ALL_PROJECTS_SAVED_VIEWS : PROJECT_SAVED_VIEWS);
  const views = useMemo(() => parseSavedViews(stored), [stored]);

  const { view, split, setView, setSplit } = useBoardView();
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);
  const [columns, setColumns] = useAllProjectsColumns();
  const [rawSort, setSort] = useSetting(BOARD_SORT);
  const [hidden, setHidden] = useSetting(BOARD_TABLE_HIDDEN);
  const [compact, setCompact] = useBoardListCompact();
  const [archive, setArchive] = useArchiveFilter(BOARD_ARCHIVE_FILTER);

  const current: BoardViewState = {
    view,
    lanes: split ? lanes : "none",
    ...(allProjects ? { columns } : {}),
    sort: parseChatSort(rawSort) ?? DEFAULT_CHAT_SORT,
    hidden,
    compact,
    archive,
  };

  /** ビューの見え方を当てる（そのボードで選べない段の分け方は、段の分け方だけそのまま） */
  const apply = (state: BoardViewState) => {
    setView(state.view);
    if (state.lanes === "none") setSplit(false);
    else if (laneOptions.includes(state.lanes)) {
      setLanes(state.lanes);
      setSplit(true);
    }
    if (allProjects && state.columns) setColumns(state.columns);
    setSort(sameChatSort(state.sort, DEFAULT_CHAT_SORT) ? null : state.sort);
    setHidden(state.hidden);
    setCompact(state.compact);
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
