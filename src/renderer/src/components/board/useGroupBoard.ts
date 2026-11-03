import { useState } from "react";
import type { RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { useChatSearch } from "../../chatSearch";
import { confirmDeleteGroup, useGroupDrop } from "../../groups";
import { useActionError } from "../../hooks/useActionError";
import { useRunRename } from "../../hooks/useRunRename";
import { useStoredChoice } from "../../hooks/useStoredState";
import { GROUP_SHOW_ARCHIVED_KEY, GROUP_VIEW_KEY } from "../../storageKeys";
import { useGroupMenu } from "../menus/GroupMenu";
import { archiveMatches, useArchiveFilter } from "./archiveFilter";
import type { BoardView } from "./BoardHeader";
import { useCardMenu } from "./useBoardCards";
import { useBoardRuns } from "./useBoardRuns";

export type GroupBoardState = ReturnType<typeof useGroupBoard>;

/**
 * グループのボードの状態と操作: グループを作る・名前を変える・削除する（「…」メニュー）、列へのドロップ（チャットを移す・列を並べ替える）、
 * 名前の検索、アーカイブでの絞り込みとボード / リスト / スイムレーンの切り替え（どちらもカンバンとは別に覚える）、失敗の文。
 * チャットはカンバンと同じく useBoardRuns で読み、アーカイブ済みを出すときはそれも読み込む（runs は読み込んだすべて、shown は絞り込んだもの）
 */
export function useGroupBoard({ projectId, groups }: { projectId: number; groups: RunGroup[] }) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  const { error, setError, guard } = useActionError();
  const [archive, setArchive] = useArchiveFilter(GROUP_SHOW_ARCHIVED_KEY);
  const { runs, loaded } = useBoardRuns(projectId, archive !== "active", setError);
  const shown = runs.filter((r) => archiveMatches(r, archive));
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useRunRename(setError);
  const menu = useCardMenu();
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  const [view, setView] = useStoredChoice<BoardView>(GROUP_VIEW_KEY, ["board", "list", "lanes"], "board");

  const groupIds = new Set(groups.map((g) => g.id));
  /** そのグループ（null はグループなし）のチャット。アーカイブと検索で絞り、新しく動いた順 */
  const membersOf = (groupId: number | null) =>
    shown
      .filter((r) => (groupId === null ? r.group_id === null || !groupIds.has(r.group_id) : r.group_id === groupId))
      .filter(search.matches)
      .sort((a, b) => b.active_at.localeCompare(a.active_at));

  const removeGroup = async (group: RunGroup) => {
    if (await confirmDeleteGroup(group)) void guard(() => api.deleteGroup(group.id));
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });
  // 列をドロップ先にする。チャットはその列のグループへ、グループの列はその位置へ並べ替える
  const { reorder, over, dropProps } = useGroupDrop({
    groups,
    runs,
    onReorder: (ids) => void guard(() => api.reorderGroups(projectId, ids)),
    onMoveRun: (run, groupId) => void guard(() => api.setRunGroup(run.id, groupId)),
  });

  return {
    runs,
    loaded,
    shown,
    archive,
    setArchive,
    creating,
    setCreating,
    renaming,
    setRenaming,
    error,
    setError,
    rename,
    menu,
    query,
    setQuery,
    view,
    setView,
    search,
    membersOf,
    groupMenu,
    reorder,
    over,
    dropProps,
    createGroup: (name: string) => {
      setCreating(false);
      void guard(() => api.createGroup(projectId, name));
    },
    renameGroup: (group: RunGroup, name: string) => {
      setRenaming(undefined);
      void guard(() => api.renameGroup(group.id, name));
    },
  };
}
