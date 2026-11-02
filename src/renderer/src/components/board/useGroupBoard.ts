import { useState } from "react";
import type { Run, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { useChatSearch } from "../../chatSearch";
import { confirmDeleteGroup, useGroupDrop } from "../../groups";
import { useActionError } from "../../hooks/useActionError";
import { useRunRename } from "../../hooks/useRunRename";
import { useStoredChoice } from "../../hooks/useStoredState";
import { GROUP_VIEW_KEY } from "../../storageKeys";
import { useGroupMenu } from "../menus/GroupMenu";
import type { BoardView } from "./BoardHeader";
import { useCardMenu } from "./useBoardCards";

export type GroupBoardState = ReturnType<typeof useGroupBoard>;

/**
 * グループのボードの状態と操作: グループを作る・名前を変える・削除する（「…」メニュー）、列へのドロップ（チャットを移す・列を並べ替える）、
 * 名前の検索、ボード / リスト / スイムレーンの切り替え（カンバンとは別に覚える）、失敗の文
 */
export function useGroupBoard({ projectId, runs, groups }: { projectId: number; runs: Run[]; groups: RunGroup[] }) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  const { error, setError, guard } = useActionError();
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useRunRename(setError);
  const menu = useCardMenu();
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  const [view, setView] = useStoredChoice<BoardView>(GROUP_VIEW_KEY, ["board", "list", "lanes"], "board");

  const groupIds = new Set(groups.map((g) => g.id));
  /** そのグループ（null はグループなし）のチャット。検索で絞り、新しく動いた順 */
  const membersOf = (groupId: number | null) =>
    runs
      .filter((r) => (groupId === null ? r.group_id === null || !groupIds.has(r.group_id) : r.group_id === groupId))
      .filter(search.matches)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

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
