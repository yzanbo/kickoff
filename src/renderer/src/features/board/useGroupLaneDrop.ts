import type { Chat } from "@shared/types";
import { api } from "@/api";
import type { ChatBucket } from "@/features/chatList/buckets";
import { useGroupDrop } from "@/features/group/groups";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { useChats } from "@/stores/chats";
import { useGroups } from "@/stores/groups";
import { reportFailure } from "@/ui/dialogs";

type Lane = ChatBucket<PanelDraft>;

/**
 * プロジェクトのボードの段: グループ（列は状態）で、カードを別のグループの段へドラッグして落とすと、そのグループへ移す（「No Group」の段ならグループから外す）。
 * ドロップの決まりはサイドバー・グループの列と同じ useGroupDrop（ほかのプロジェクトのチャットは受けない）。
 * enabled でなければ何も付けない。laneProps は BoardLanes の段の要素に付ける（重ねている間は .drop-target）
 */
export function useGroupLaneDrop(projectId: number | undefined, enabled: boolean): { laneProps?: (lane: Lane) => Record<string, unknown> } {
  const groups = useGroups(enabled ? projectId : undefined);
  const { chats } = useChats({ projectId, enabled: enabled && projectId !== undefined });
  const { over, dropProps } = useGroupDrop({
    projectId: projectId ?? 0,
    groups,
    chats,
    onReorder: (ids) => {
      if (projectId !== undefined && ids.some((id, i) => id !== groups[i]?.id)) void api.reorderGroups(projectId, ids).catch(reportFailure("グループを並べ替えられませんでした"));
    },
    onMoveChat: (chat: Chat, groupId) => void api.setChatGroup(chat.id, groupId).catch(reportFailure("グループを移せませんでした")),
  });
  if (!enabled || projectId === undefined) return {};
  /** 段のグループ（グループの段はそのグループ、「No Group」の段は null。ほかの段は落とし先にしない） */
  const groupOf = (lane: Lane): number | null | undefined => (lane.kind === "group" ? lane.group?.id : lane.kind === "ungrouped" ? null : undefined);
  return {
    laneProps: (lane) => {
      const groupId = groupOf(lane);
      if (groupId === undefined) return {};
      return { ...dropProps(groupId), className: over === (groupId ?? "none") ? "drop-target" : undefined };
    },
  };
}
