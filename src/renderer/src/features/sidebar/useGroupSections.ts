import { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { Chat, ChatGroup, Project } from "@shared/types";
import { moveDroppedChatToProject } from "@/features/chat/chatActions";
import { busyBlockReason } from "@/features/chat/chatBusy";
import { api } from "@/api";
import { openNewChat } from "@/app/router";
import { cx } from "@/lib/cx";
import { confirmDeleteGroup, UNGROUPED_SORT_ID, useGroupDrop } from "@/features/group/groups";
import { ungroupedPosition } from "@/features/group/groupOrder";
import { groupBoardUngroupedAt } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { useGroupMenu } from "@/features/group/GroupMenu";
import { setDraftGroup } from "@/features/panel/state/panelDrafts";
import { restoreDroppedChat } from "./ArchivedBucketFold";

/** サイドバーのグループ 1 つに渡す、見出しの操作の束（メニュー・名前の変更・ドロップ先・並べ替え） */
export interface GroupSectionProps {
  menu: { openFor: (group: ChatGroup, e: MouseEvent) => void; button: (group: ChatGroup) => ReactNode };
  renaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  /** ドロップ先・並べ替えの見た目（チャットと下書きを受け取る） */
  dropClass?: string;
  dropProps: Record<string, unknown>;
  dragProps: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
}

/**
 * サイドバーの自分で作ったグループの操作（プロジェクトごとに 1 つ）: 「…」メニュー（新しいチャット・名前を変更・削除）・名前の変更中のグループ・
 * ドロップ先（チャットはそのグループへ、アーカイブ済みのチャットは確かめて戻してそのグループへ、ほかのプロジェクトのチャットは確かめてこのプロジェクトへ移してそのグループへ、グループの見出しはその位置へ並べ替える）。グループごとの束は sectionProps(group) で取る。
 * 「No Group」もグループと同じく見出しのドラッグでグループの間へ並べ替え、位置（ungroupedAt。前にあるグループの数）を
 * 全プロジェクトのボードのグループの列と同じ設定（groupBoardUngroupedAt。プロジェクトごと）に覚える（覚えていなければいちばん下）。
 * menuExtra はメニューの下に足す項目（「まとまりを色付きで表示」）
 */
export function useGroupSections({ project, groups, chats, menuExtra }: { project: Project; groups: ChatGroup[]; chats: Chat[]; menuExtra?: ReactNode }) {
  const projectId = project.id;
  const [renaming, setRenaming] = useState<number>();
  const removeGroup = async (group: ChatGroup) => {
    if (await confirmDeleteGroup(group)) await api.deleteGroup(group.id);
  };
  // グループの「…」メニュー（右クリックでも開く）
  const menu = useGroupMenu({
    onNewChat: (g) => openNewChat(projectId, { group: g.id }),
    onRename: (g) => setRenaming(g.id),
    onDelete: (g) => void removeGroup(g),
    extra: menuExtra,
  });
  const [savedUngroupedAt, setUngroupedAt] = useSetting(groupBoardUngroupedAt(projectId));
  const ungroupedAt = ungroupedPosition(savedUngroupedAt, groups.length, true);
  // グループの並びは DB、「No Group」の位置は画面に覚える（変わった方だけ書く）
  const { reorder, over, blocked, dropProps } = useGroupDrop({
    projectId,
    groups,
    chats,
    ungroupedAt,
    onReorder: (ids, at) => {
      if (at !== undefined && at !== ungroupedAt) setUngroupedAt(at);
      if (ids.some((id, i) => id !== groups[i]?.id)) void api.reorderGroups(projectId, ids);
    },
    onMoveChat: (chat, groupId) => void api.setChatGroup(chat.id, groupId),
    // アーカイブ済みのチャット（まとまりのいちばん下の「アーカイブ済み」の行）を落としたら、確かめて戻し、そのグループへ移す
    onRestoreChat: (chat, groupId) => void restoreDroppedChat(chat, groupId),
    // 送る前の新しいチャット（下書き）は、作成先のグループを変える（送ったときにそのグループに入る）
    // ほかのプロジェクトのチャットは、確かめてからこのプロジェクトへ移し、落としたグループへ入れる（No Group ならグループなし）
    onForeignChat: (chat, groupId) => {
      const group = groups.find((g) => g.id === groupId);
      moveDroppedChatToProject(chat, project, group && { id: group.id, name: group.name });
    },
    // 作業中のチャット（子孫も）は別のプロジェクトへ移せないので、落とせないことを見せる
    foreignBlockedBy: (chat) => busyBlockReason(chat.id, "移動"),
    onMoveDraft: (draft, groupId) => setDraftGroup(draft, groupId ?? undefined, groups.find((g) => g.id === groupId)?.name),
  });
  return {
    sectionProps: (group: ChatGroup): GroupSectionProps => ({
      menu,
      renaming: renaming === group.id,
      onRenameStart: () => setRenaming(group.id),
      onRenameEnd: () => setRenaming(undefined),
      dropClass: cx(over === group.id && (blocked ? "drop-blocked" : "drop-target"), reorder.classFor(group.id)),
      dropProps: dropProps(group.id),
      dragProps: reorder.handle(group.id),
    }),
    /** グループの並びの中の「No Group」の位置（前にあるグループの数） */
    ungroupedAt,
    /** 「No Group」のまとまり（見出しと中身を包む要素）: ドロップ先（チャットをグループから外す・並べ替えの位置）と、見出しのドラッグ */
    ungrouped: {
      className: cx("custom-group", over === "none" && (blocked ? "drop-blocked" : "drop-target"), reorder.classFor(UNGROUPED_SORT_ID)),
      dropProps: dropProps(null),
      dragProps: reorder.handle(UNGROUPED_SORT_ID),
    },
    /** 開いているメニュー（プロジェクトの要素の中に描く） */
    menuElement: menu.menu,
  };
}
