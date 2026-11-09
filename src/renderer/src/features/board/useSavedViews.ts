import { useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import {
  ALL_PROJECTS_FEED,
  ALL_PROJECTS_SAVED_VIEWS,
  BOARD_ARCHIVE_FILTER,
  BOARD_CARD_HIDDEN,
  BOARD_SORT,
  PROJECT_SAVED_VIEWS,
} from "@/lib/storageKeys";
import { useArchiveFilter } from "./archiveFilter";
import { useBoardColumns, useGroupsByState } from "./BoardColumnsToggle";
import { useBoardView } from "./BoardHeader";
import { hiddenCardFields } from "./cardFields";
import { DEFAULT_CHAT_SORT, parseChatSort, sameChatSort } from "./chatSort";
import { activeView, addView, moveView, parseSavedViews, projectViewState, removeView, renameView, replaceViewState, type BoardViewState } from "./savedViews";
import { useKanbanLanes } from "./useKanbanFilters";

/**
 * 保存したビュー（全プロジェクトのボードとプロジェクトのボードで別の一覧。プロジェクトのボードの一覧はすべてのプロジェクトで共通）と、いまの見え方・当てる操作。
 * 見え方の設定（表示・段・列の分け方・並び順・アーカイブ・表示項目）はそれぞれの設定のまま読み書きし、ビューはその組を覚えるだけ。
 * projectId がなければ全プロジェクトのボード。列の分け方はどちらのボードも 状態 / グループ / グループ×状態 / 分けない を覚える
 * （列の分け方のないプロジェクトのボードの前の版のビューは、projectViewState で状態として読む）
 */
export function useSavedViews(projectId?: number) {
  const allProjects = projectId === undefined;
  const [stored, setStored] = useSetting(allProjects ? ALL_PROJECTS_SAVED_VIEWS : PROJECT_SAVED_VIEWS);
  // プロジェクトのボードの前の版のビュー（列の分け方なし）は、状態の列として読む
  const views = useMemo(() => {
    const parsed = parseSavedViews(stored);
    return allProjects ? parsed : parsed.map((v) => ({ ...v, state: projectViewState(v.state) }));
  }, [stored, allProjects]);

  const { view, split, setView, setSplit } = useBoardView();
  const { lanes, options: laneOptions, setLanes } = useKanbanLanes(allProjects);
  const [columns, setColumns] = useBoardColumns(allProjects);
  const [rawSort, setSort] = useSetting(BOARD_SORT);
  const [archive, setArchive] = useArchiveFilter(BOARD_ARCHIVE_FILTER);
  const [feed, setFeed] = useSetting(ALL_PROJECTS_FEED);
  const [byState, setByState] = useGroupsByState();
  const [cardHidden, setCardHidden] = useSetting(BOARD_CARD_HIDDEN);

  const current: BoardViewState = {
    view: allProjects && feed ? "feed" : view,
    lanes: split ? lanes : "none",
    columns: columns === "groups" && byState ? "groupsState" : columns,
    sort: parseChatSort(rawSort) ?? DEFAULT_CHAT_SORT,
    archive,
    cardHidden: [...hiddenCardFields(cardHidden)],
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
    if (state.columns) {
      if (state.columns === "groups" || state.columns === "groupsState") setByState(state.columns === "groupsState");
      setColumns(state.columns === "groupsState" ? "groups" : state.columns);
    }
    setSort(sameChatSort(state.sort, DEFAULT_CHAT_SORT) ? null : state.sort);
    setArchive(state.archive);
    if (state.cardHidden) setCardHidden(state.cardHidden);
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
    /** ビュー id を target の前・後ろへ動かす（ドラッグの並べ替え） */
    move: (id: string, target: string, side: "before" | "after") => setStored(moveView(views, id, target, side)),
  };
}
