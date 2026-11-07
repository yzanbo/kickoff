import { useState } from "react";
import type { ChatGroup } from "@shared/types";
import { api } from "@/api";
import { useChatSearch } from "@/features/chat/chatSearch";
import { confirmDeleteGroup, useGroupDrop } from "@/features/group/groups";
import { useAction } from "@/hooks/useAction";
import { useChatRename } from "@/features/chat/useChatRename";
import { GROUP_BOARD_ARCHIVE_FILTER, groupBoardUngroupedAt } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { useGroupMenu } from "@/features/group/GroupMenu";
import { archiveMatches, useArchiveFilter } from "./archiveFilter";
import { useBoardView } from "./BoardHeader";
import { ungroupedPosition } from "@/features/group/groupOrder";
import { useCardMenu } from "./useBoardCards";
import { useChats } from "@/stores/chats";
import { useProjects } from "@/stores/projects";
import { moveDroppedChatToProject } from "@/features/chat/chatActions";
import { busyBlockReason } from "@/features/chat/chatBusy";

export type GroupBoardState = ReturnType<typeof useGroupBoard>;

/**
 * グループのボードの状態と操作: グループを作る・名前を変える・削除する（「…」メニュー）、列へのドロップ（チャットを移す・ほかのプロジェクトのチャットは確かめてから移す・列を並べ替える）、
 * 名前の検索、アーカイブでの絞り込みとボード / リスト / スイムレーンの切り替え（どちらもカンバンとは別に覚える）、失敗の文。
 * 「No Group」もグループと同じく見出しのドラッグで並べ替え、位置（ungroupedAt）をプロジェクトごとに覚える（groupBoardUngroupedAt。ボードとリストで共通）。
 * チャットはカンバンと同じくチャットの店（useChats）から読み、アーカイブ済みを出すときはそれも読み込む
 * （chats は読み込んだすべて、shown はアーカイブと名前の検索で絞り込んだもの。グループの列・段への分け方は bucketChats）
 */
export function useGroupBoard({ projectId, groups }: { projectId: number; groups: ChatGroup[] }) {
  const { projectName } = useProjects();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  const { error, setError, guard } = useAction();
  const [archive, setArchive] = useArchiveFilter(GROUP_BOARD_ARCHIVE_FILTER);
  const { chats, loaded, error: loadError } = useChats({ projectId, archived: archive !== "active" });
  // 右クリックメニューの「名前を変更」は、カード・行の名前をその場で入力欄にする
  const rename = useChatRename(setError);
  const menu = useCardMenu();
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  const shown = chats.filter((r) => archiveMatches(r, archive) && search.matches(r));
  // 表示（ボード / リスト）と、段（グループ）に分けるか
  const { view, split, setView, setSplit } = useBoardView();

  const removeGroup = async (group: ChatGroup) => {
    if (await confirmDeleteGroup(group)) void guard(() => api.deleteGroup(group.id));
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });
  // グループの並びの中の「No Group」の位置（覚えていなければ、ボードは先頭・リストはいちばん下）
  const [savedUngroupedAt, setUngroupedAt] = useSetting(groupBoardUngroupedAt(projectId));
  const ungroupedAt = ungroupedPosition(savedUngroupedAt, groups.length, view === "list");
  // 列をドロップ先にする。チャットはその列のグループへ、グループ・「No Group」の列はその位置へ並べ替える
  // （グループの並びは DB、「No Group」の位置は画面に覚える。変わった方だけ書く）
  const { reorder, over, blocked, dropProps } = useGroupDrop({
    projectId,
    groups,
    chats,
    ungroupedAt,
    onReorder: (ids, at) => {
      if (at !== undefined && at !== ungroupedAt) setUngroupedAt(at);
      if (ids.some((id, i) => id !== groups[i]?.id)) void guard(() => api.reorderGroups(projectId, ids));
    },
    onMoveChat: (chat, groupId) => void guard(() => api.setChatGroup(chat.id, groupId)),
    // ほかのプロジェクトのチャット（サイドバーから）は、確かめてからこのプロジェクトへ移し、落とした列のグループへ入れる。作業中なら落とせない
    onForeignChat: (chat, groupId) => {
      const group = groups.find((g) => g.id === groupId);
      moveDroppedChatToProject(chat, { id: projectId, name: projectName(projectId) }, group && { id: group.id, name: group.name });
    },
    foreignBlockedBy: (chat) => busyBlockReason(chat.id, "移動"),
  });
  /** 列・段の落とし先の見た目（重ねている間。落とせないときは赤） */
  const dropClass = (groupId: number | null) => (over === (groupId ?? "none") ? (blocked ? "drop-blocked" : "drop-target") : undefined);

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
    groupMenu,
    reorder,
    over,
    dropProps,
    dropClass,
    /** グループの並びの中の「No Group」の位置（前にあるグループの数） */
    ungroupedAt,
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
