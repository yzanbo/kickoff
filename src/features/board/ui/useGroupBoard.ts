import { createElement, useState } from "react";
import type { ChatGroup } from "@shared/groups/types";
import { api } from "@/foundation/ui/api";
import { NewChatItem } from "@/features/chat/ui";
import { open } from "@/foundation/ui/navigation/open";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { confirmDeleteGroup, groupsSettings, ungroupedPosition } from "@/features/groups/ui";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useGroupMenu } from "@/features/groups/ui/GroupMenu";
import { useBoard } from "./BoardContext";
import { useChats } from "@/features/chat/ui/store/knownChats";
import { useGroupDropTargets } from "./useGroupDropTargets";

export type GroupBoardState = ReturnType<typeof useGroupBoard>;

/**
 * グループの列（全プロジェクトのボードの列: グループ。ProjectGroupColumns）の状態と操作: そのグループに新しいチャットを作る・グループの名前を変える・削除する（「…」メニュー）、
 * 列へのドロップ（チャットを移す・ほかのプロジェクトのチャットは確かめてから移す・列を並べ替える）、失敗の文。絞り込み・検索・表示は全プロジェクトのボードのもの。
 * 「No Group」もグループと同じく見出しのドラッグで並べ替え、位置（ungroupedAt）をプロジェクトごとに覚える（groupsSettings.ungroupedAt。ボードとリスト・サイドバーで共通）。
 */
export function useGroupBoard({ projectId, groups }: { projectId: number; groups: ChatGroup[] }) {
  const [renaming, setRenaming] = useState<number>();
  const { error, guard } = useAction();
  // チャットの一覧を読み込めなかった理由（操作の失敗がなければ出す）
  const { error: loadError } = useChats({ projectId });
  // 表示（ボード / リスト。No Group の位置の初めの値を決める）
  const { view } = useBoard().layout;

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
  const { reorder, over, dropProps, dropClass } = useGroupDropTargets(projectId, "columns", {
    groups,
    ungroupedAt,
    setUngroupedAt,
    run: (task) => void guard(task),
  });

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
