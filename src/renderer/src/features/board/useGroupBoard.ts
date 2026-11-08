import { useState } from "react";
import type { ChatGroup } from "@shared/types";
import { api } from "@/api";
import { confirmDeleteGroup, useGroupDrop } from "@/features/group/groups";
import { useAction } from "@/hooks/useAction";
import { groupBoardUngroupedAt } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { useGroupMenu } from "@/features/group/GroupMenu";
import { useBoardView } from "./BoardHeader";
import { ungroupedPosition } from "@/features/group/groupOrder";
import { useChats } from "@/stores/chats";
import { useProjects } from "@/stores/projects";
import { moveDroppedChatToProject } from "@/features/chat/chatActions";
import { busyBlockReason } from "@/features/chat/chatBusy";

export type GroupBoardState = ReturnType<typeof useGroupBoard>;

/**
 * グループの列（全プロジェクトのボードの列: グループ。ProjectGroupColumns）の状態と操作: グループの名前を変える・削除する（「…」メニュー）、
 * 列へのドロップ（チャットを移す・ほかのプロジェクトのチャットは確かめてから移す・列を並べ替える）、失敗の文。絞り込み・検索・表示は全プロジェクトのボードのもの。
 * 「No Group」もグループと同じく見出しのドラッグで並べ替え、位置（ungroupedAt）をプロジェクトごとに覚える（groupBoardUngroupedAt。ボードとリスト・サイドバーで共通）。
 * ドロップで引くチャットは、そのプロジェクトの読み込んだチャット（チャットの店 useChats）
 */
export function useGroupBoard({ projectId, groups }: { projectId: number; groups: ChatGroup[] }) {
  const { projectName } = useProjects();
  const [renaming, setRenaming] = useState<number>();
  const { error, guard } = useAction();
  const { chats, error: loadError } = useChats({ projectId });
  // 表示（ボード / リスト / 表。No Group の位置の初めの値を決める）
  const { view } = useBoardView();

  const removeGroup = async (group: ChatGroup) => {
    if (await confirmDeleteGroup(group)) void guard(() => api.deleteGroup(group.id));
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });
  // グループの並びの中の「No Group」の位置（覚えていなければ、ボードは先頭・リストはいちばん下）
  const [savedUngroupedAt, setUngroupedAt] = useSetting(groupBoardUngroupedAt(projectId));
  // 覚えていなければ、ボードは先頭・リストと表はいちばん下
  const ungroupedAt = ungroupedPosition(savedUngroupedAt, groups.length, view !== "board");
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
    renaming,
    setRenaming,
    /** 操作の失敗（なければチャットの一覧を読み込めなかった理由） */
    error: error ?? loadError,
    groupMenu,
    reorder,
    over,
    dropProps,
    dropClass,
    /** グループの並びの中の「No Group」の位置（前にあるグループの数） */
    ungroupedAt,
    renameGroup: (group: ChatGroup, name: string) => {
      setRenaming(undefined);
      void guard(() => api.renameGroup(group.id, name));
    },
  };
}
