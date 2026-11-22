import type { ChatGroup } from "@shared/groups/types";
import { api } from "@/foundation/ui/api";
import { restoreDroppedChat, useGroupDrop } from "@/features/chatList/ui";
import { busyBlockReason, moveDroppedChatToProject } from "@/features/chat/ui";
import { useProjects } from "@/features/projects/ui";

/** 落としたあとの操作を流す（失敗の出し方は呼ぶ側。列は列の上の文、段はお知らせ） */
type Run = (task: () => Promise<unknown>, failed: string) => void;

/**
 * ボードのグループの落とし先（全プロジェクトのボードのグループの列 columns・プロジェクトのボードの段 lanes で同じ）。
 * チャットはそのグループへ移し（アーカイブ済みは確かめて戻してから）、グループの見出しはその位置へ並べ替える（グループの並びは DB）。
 * 列だけ: 「No Group」も並べ替え（位置 ungroupedAt は画面に覚える。変わった方だけ書く）、ほかのプロジェクトのチャット（サイドバーから）は確かめてからこのプロジェクトへ移して落とした列のグループへ入れる（作業中なら落とせない）
 */
export function useGroupDropTargets(
  projectId: number,
  mode: "columns" | "lanes",
  { groups, ungroupedAt, setUngroupedAt, run }: { groups: readonly ChatGroup[]; ungroupedAt?: number; setUngroupedAt?: (at: number) => void; run: Run },
) {
  const { projectName } = useProjects();
  const columns = mode === "columns";
  const drop = useGroupDrop({
    projectId,
    groups,
    ungroupedAt: columns ? ungroupedAt : undefined,
    onReorder: (ids, at) => {
      if (at !== undefined && at !== ungroupedAt) setUngroupedAt?.(at);
      if (ids.some((id, i) => id !== groups[i]?.id)) run(() => api.reorderGroups(projectId, ids), "グループを並べ替えられませんでした");
    },
    on: {
      chat: (chat, groupId) => run(() => api.setChatGroup(chat.id, groupId), "グループを移せませんでした"),
      // アーカイブ済みのカードは、確かめて戻してから、落とした列・段のグループへ入れる
      archived: (chat, groupId) => void restoreDroppedChat(chat, groupId),
      foreign: columns
        ? (chat, groupId) => {
            const group = groups.find((g) => g.id === groupId);
            moveDroppedChatToProject(chat, { id: projectId, name: projectName(projectId) }, group && { id: group.id, name: group.name });
          }
        : undefined,
    },
    blockedBy: { foreign: (chat) => busyBlockReason(chat.id, "移動") },
  });
  return {
    ...drop,
    /** 列・段の落とし先の見た目（重ねている間。落とせないときは赤） */
    dropClass: (groupId: number | null) => (drop.over === (groupId ?? "none") ? (drop.blocked ? "drop-blocked" : "drop-target") : undefined),
  };
}
