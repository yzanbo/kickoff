import { createElement, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { ChatGroup } from "@shared/groups/types";
import type { Project } from "@shared/projects/types";
import { NO_GROUP_LABEL } from "@shared/groups/labels";
import { errorMessage } from "@shared/foundation/errors";
import { alert } from "@/foundation/ui/kit/ask";
import { NewChatItem, chatsApi, moveDroppedChatToProject, busyBlockReason } from "@/features/chat/ui";
import { open } from "@/foundation/ui/navigation/open";
import { cx } from "@/foundation/ui/lib/cx";
import { confirmDeleteGroup, groupsSettings, UNGROUPED_SORT_ID, ungroupedPosition, groupsApi, useGroupMenu } from "@/features/groups/ui";
import { restoreDroppedChat, useGroupDrop } from "@/features/chatList/ui";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { detachBlockReason, detachChild } from "@/features/childChats/ui";
import { setDraftGroup } from "@/features/chatPanel/ui";

/** サイドバーのグループ 1 つに渡す、見出しの操作の束（メニュー・名前の変更・ドロップ先・並べ替え） */
export interface GroupSectionProps {
  menu: { openFor: (group: ChatGroup, e: MouseEvent) => void; button: (group: ChatGroup) => ReactNode };
  renaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  /** ドロップ先・並べ替えの見た目（チャットと下書きを受け取る） */
  dropClass?: string;
  dropProps: Record<string, unknown>;
  dragProps?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
}

/**
 * サイドバーの自分で作ったグループの操作（プロジェクトごとに 1 つ）: 「…」メニュー（新しいチャット・名前を変更・削除）・名前の変更中のグループ・
 * ドロップ先（チャットはそのグループへ、アーカイブ済みのチャットは確かめて戻してそのグループへ、ほかのプロジェクトのチャットは確かめてこのプロジェクトへ移してそのグループへ、グループの見出しはその位置へ並べ替える）。グループごとの束は sectionProps(group) で取る。
 * 「No Group」もグループと同じく見出しのドラッグでグループの間へ並べ替え、位置（ungroupedAt。前にあるグループの数）を
 * 全プロジェクトのボードのグループの列と同じ設定（groupsSettings.ungroupedAt。プロジェクトごと）に覚える（覚えていなければいちばん下）。
 * menuExtra はメニューの下に足す項目（「まとまりを色付きで表示」）
 */
export function useGroupSections({ project, groups, menuExtra }: { project: Project; groups: ChatGroup[]; menuExtra?: ReactNode }) {
  const projectId = project.id;
  const [renaming, setRenaming] = useState<number>();
  const removeGroup = async (group: ChatGroup) => {
    if (await confirmDeleteGroup(group)) await groupsApi.deleteGroup(group.id);
  };
  // グループの「…」メニュー（右クリックでも開く）
  const menu = useGroupMenu({
    // チャットの右クリックと同じく、どこで始めるか（グループの札と作業場所の札「本体」）を項目の右に添える
    lead: (g) => createElement(NewChatItem, { place: { projectId: g.project_id, group: g.id }, sameAs: "", onSelect: () => open({ kind: "newChat", projectId, groupId: g.id }) }),
    onRename: (g) => setRenaming(g.id),
    onDelete: (g) => void removeGroup(g),
    extra: menuExtra,
  });
  const [savedUngroupedAt, setUngroupedAt] = useSetting(groupsSettings.ungroupedAt(projectId));
  const ungroupedAt = ungroupedPosition(savedUngroupedAt, groups.length, true);
  // グループの並びは DB、「No Group」の位置は画面に覚える（変わった方だけ書く）
  const { reorder, over, blocked, dropProps } = useGroupDrop({
    projectId,
    groups,
    ungroupedAt,
    onReorder: (ids, at) => {
      if (at !== undefined && at !== ungroupedAt) setUngroupedAt(at);
      if (ids.some((id, i) => id !== groups[i]?.id)) void groupsApi.reorderGroups(projectId, ids);
    },
    on: {
      chat: (chat, groupId) => void chatsApi.setChatGroup(chat.id, groupId),
      // アーカイブ済みのチャット（まとまりのいちばん下の「アーカイブ済み」の行）を落としたら、確かめて戻し、そのグループへ移す
      archived: (chat, groupId) => void restoreDroppedChat(chat, groupId),
      // 送る前の新しいチャット（下書き）は、作成先のグループを変える（送ったときにそのグループに入る）
      draft: (draft, groupId) => setDraftGroup(draft, groupId ?? undefined, groups.find((g) => g.id === groupId)?.name),
      // ほかのプロジェクトのチャットは、確かめてからこのプロジェクトへ移し、落としたグループへ入れる（No Group ならグループなし）
      foreign: (chat, groupId) => {
        const group = groups.find((g) => g.id === groupId);
        moveDroppedChatToProject(chat, project, group && { id: group.id, name: group.name });
      },
      // 同じプロジェクトの子チャットは、確かめてから親から外し、落としたグループへ入れる（No Group ならグループなし）
      child: (chat, groupId) =>
        void detachChild(chat, { parentId: null, groupId, groupName: groups.find((g) => g.id === groupId)?.name ?? NO_GROUP_LABEL }).catch((e: unknown) =>
          alert("親から外せませんでした", errorMessage(e)),
        ),
    },
    // 作業中のチャット（子孫も）は別のプロジェクトへ移せない・作業中の子チャットは親から外せないので、落とせないことを見せる
    blockedBy: { foreign: (chat) => busyBlockReason(chat.id, "移動"), child: detachBlockReason },
  });
  return {
    sectionProps: (group: ChatGroup): GroupSectionProps => ({
      menu,
      renaming: renaming === group.id,
      onRenameStart: () => setRenaming(group.id),
      onRenameEnd: () => setRenaming(undefined),
      dropClass: cx(over === group.id && (blocked ? "drop-blocked" : "drop-target")),
      dropProps: { ...dropProps(group.id), ...reorder.attrsFor(group.id) },
      dragProps: reorder.handle(group.id),
    }),
    /** グループの並びの中の「No Group」の位置（前にあるグループの数） */
    ungroupedAt,
    /** 「No Group」のまとまり（見出しと中身を包む要素）: ドロップ先（チャットをグループから外す・並べ替えの位置）と、見出しのドラッグ */
    ungrouped: {
      className: cx("custom-group", over === "none" && (blocked ? "drop-blocked" : "drop-target")),
      dropProps: { ...dropProps(null), ...reorder.attrsFor(UNGROUPED_SORT_ID) },
      dragProps: reorder.handle(UNGROUPED_SORT_ID),
    },
    /** 開いているメニュー（プロジェクトの要素の中に描く） */
    menuElement: menu.menu,
  };
}
