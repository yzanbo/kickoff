import { useState } from "react";
import type { ChatGroup } from "@shared/types";
import { api } from "@/api";
import { useChatSearch } from "@/features/chat/chatSearch";
import { confirmDeleteGroup, useGroupDrop } from "@/features/group/groups";
import { useAction } from "@/hooks/useAction";
import { useChatRename } from "@/features/chat/useChatRename";
import { GROUP_BOARD_ARCHIVE_FILTER } from "@/lib/storageKeys";
import { useGroupMenu } from "@/features/group/GroupMenu";
import { archiveMatches, useArchiveFilter } from "./archiveFilter";
import { useBoardView } from "./BoardHeader";
import { useCardMenu } from "./useBoardCards";
import { useChats } from "@/stores/chats";

export type GroupBoardState = ReturnType<typeof useGroupBoard>;

/**
 * グループのボードの状態と操作: グループを作る・名前を変える・削除する（「…」メニュー）、列へのドロップ（チャットを移す・列を並べ替える）、
 * 名前の検索、アーカイブでの絞り込みとボード / リスト / スイムレーンの切り替え（どちらもカンバンとは別に覚える）、失敗の文。
 * チャットはカンバンと同じくチャットの店（useChats）から読み、アーカイブ済みを出すときはそれも読み込む（chats は読み込んだすべて、shown は絞り込んだもの）
 */
export function useGroupBoard({ projectId, groups }: { projectId: number; groups: ChatGroup[] }) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  const { error, setError, guard } = useAction();
  const [archive, setArchive] = useArchiveFilter(GROUP_BOARD_ARCHIVE_FILTER);
  const { chats, loaded, error: loadError } = useChats({ projectId, archived: archive !== "active" });
  const shown = chats.filter((r) => archiveMatches(r, archive));
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useChatRename(setError);
  const menu = useCardMenu();
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  // 表示（ボード / リスト）と、段（グループ）に分けるか
  const { view, split, setView, setSplit } = useBoardView();

  const groupIds = new Set(groups.map((g) => g.id));
  /** そのグループ（null はグループなし）のチャット。アーカイブと検索で絞り、新しく動いた順 */
  const membersOf = (groupId: number | null) =>
    shown
      .filter((r) => (groupId === null ? r.group_id === null || !groupIds.has(r.group_id) : r.group_id === groupId))
      .filter(search.matches)
      .sort((a, b) => b.active_at.localeCompare(a.active_at));

  const removeGroup = async (group: ChatGroup) => {
    if (await confirmDeleteGroup(group)) void guard(() => api.deleteGroup(group.id));
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });
  // 列をドロップ先にする。チャットはその列のグループへ、グループの列はその位置へ並べ替える
  const { reorder, over, dropProps } = useGroupDrop({
    groups,
    chats,
    onReorder: (ids) => void guard(() => api.reorderGroups(projectId, ids)),
    onMoveChat: (chat, groupId) => void guard(() => api.setChatGroup(chat.id, groupId)),
  });

  return {
    chats,
    loaded,
    shown,
    archive,
    setArchive,
    creating,
    setCreating,
    renaming,
    setRenaming,
    /** 操作の失敗（なければチャットの一覧を読み込めなかった理由） */
    error: error ?? loadError,
    setError,
    rename,
    menu,
    query,
    setQuery,
    view,
    split,
    setView,
    setSplit,
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
    renameGroup: (group: ChatGroup, name: string) => {
      setRenaming(undefined);
      void guard(() => api.renameGroup(group.id, name));
    },
  };
}
