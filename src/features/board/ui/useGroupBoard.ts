import { createElement, useState } from "react";
import type { ChatGroup } from "@shared/groups/types";
import { api } from "@/foundation/ui/api";
import { NewChatItem } from "@/features/chat/ui";
import { open } from "@/foundation/ui/navigation/open";
import { confirmDeleteGroup, useGroupDrop } from "@/features/groups/ui/groups";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { groupsSettings } from "@/features/groups/ui";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useGroupMenu } from "@/features/groups/ui/GroupMenu";
import { useBoardView } from "./BoardHeader";
import { ungroupedPosition } from "@/features/groups/ui/groupOrder";
import { useChats } from "@/features/chat/ui/store/knownChats";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { moveDroppedChatToProject } from "@/features/chat/ui/chatActions";
import { busyBlockReason } from "@/features/chat/ui/state/chatBusy";

export type GroupBoardState = ReturnType<typeof useGroupBoard>;

/**
 * グループの列（全プロジェクトのボードの列: グループ。ProjectGroupColumns）の状態と操作: そのグループに新しいチャットを作る・グループの名前を変える・削除する（「…」メニュー）、
 * 列へのドロップ（チャットを移す・ほかのプロジェクトのチャットは確かめてから移す・列を並べ替える）、失敗の文。絞り込み・検索・表示は全プロジェクトのボードのもの。
 * 「No Group」もグループと同じく見出しのドラッグで並べ替え、位置（ungroupedAt）をプロジェクトごとに覚える（groupsSettings.ungroupedAt。ボードとリスト・サイドバーで共通）。
 * ドロップで引くチャットは、そのプロジェクトの読み込んだチャット（チャットの店 useChats）
 */
export function useGroupBoard({ projectId, groups }: { projectId: number; groups: ChatGroup[] }) {
  const { projectName } = useProjects();
  const [renaming, setRenaming] = useState<number>();
  const { error, guard } = useAction();
  const { chats, error: loadError } = useChats({ projectId });
  // 表示（ボード / リスト。No Group の位置の初めの値を決める）
  const { view } = useBoardView();

  const removeGroup = async (group: ChatGroup) => {
    if (await confirmDeleteGroup(group)) void guard(() => api.deleteGroup(group.id));
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({
    // チャットの右クリックと同じく、どこで始めるか（グループの札と作業場所の札「本体」）を項目の右に添える
    lead: (g) => createElement(NewChatItem, { place: { projectId: g.project_id, group: g.id }, sameAs: "", onSelect: () => open({ kind: "newChat", projectId, groupId: g.id }) }),
    onRename: (g) => setRenaming(g.id),
    onDelete: (g) => void removeGroup(g),
  });
  // グループの並びの中の「No Group」の位置（覚えていなければ、ボードは先頭・リストはいちばん下）
  const [savedUngroupedAt, setUngroupedAt] = useSetting(groupsSettings.ungroupedAt(projectId));
  // 覚えていなければ、ボードは先頭・リストはいちばん下
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
    projectId,
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
