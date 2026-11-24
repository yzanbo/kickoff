import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { busyBlockReason, confirmArchiveChats, chatsApi } from "@/features/chat/ui";
import { restoreDroppedChat, useChatDropTarget } from "@/features/chatList/ui";
import { isForeignChat, useProjectChatDrops } from "./projectChatDrop";

/**
 * ドラッグで落としたチャットをアーカイブする（確かめてから。confirmArchiveChats）。groupId を渡すと、そのグループへも移す
 * （グループの中の「アーカイブ済み」へ、ほかのグループのチャットを落としたとき。null = グループから外す / undefined = 変えない）。
 * もうアーカイブ済みなら、移すだけ
 */
async function archiveDroppedChat(chat: Chat, groupId?: number | null) {
  try {
    if (!chat.archived_at && !(await confirmArchiveChats(chat))) return;
    if (groupId !== undefined && chat.group_id !== groupId) await chatsApi.setChatGroup(chat.id, groupId);
  } catch (e) {
    reportFailure("アーカイブできませんでした")(e);
  }
}

/**
 * サイドバーのプロジェクトの、まとまりの外の落とし先:
 * - archiveDrop: いちばん下の「アーカイブ済み」（・その代わりの「アーカイブ済みへ」）へ落とすとアーカイブ（アーカイブしていないチャットだけ）
 * - restoreDrop: 見出しの下の一覧（グループの見出しを出していないとき）へアーカイブ済みのチャットを落とすと戻す（どちらも確かめてから）
 * - projectDrop: ほかのプロジェクトのチャットを、このプロジェクトのまとまり（見出しのカード・一覧のどこでも）へ落とすと、確かめてから移す
 *   （グループ・No Group へ落とせば、そのグループにも入れる。useGroupSections）
 */
export function useWorkspaceDrops(project: Project, chats: readonly Chat[]) {
  const find = (id: number) => chats.find((c) => c.id === id);
  // ほかのプロジェクトのチャットは受けず、外側のプロジェクトのまとまり（確かめてから移す）へ渡す
  const foreign = (id: number) => isForeignChat(id, project.id);
  const archiveDrop = useChatDropTarget(
    (id) => {
      const chat = find(id);
      if (chat) void archiveDroppedChat(chat);
    },
    // 作業中のチャット（子孫も）はアーカイブできないので、落とせないことを見せる
    { accepts: (id) => find(id)?.archived_at === null, passThrough: foreign, blockedBy: (id) => busyBlockReason(id, "アーカイブ") },
  );
  const restoreDrop = useChatDropTarget(
    (id) => {
      const chat = find(id);
      if (chat) void restoreDroppedChat(chat);
    },
    { accepts: (id) => Boolean(find(id)?.archived_at), passThrough: foreign },
  );
  const projectDrop = useProjectChatDrops(() => project);
  return { archiveDrop, restoreDrop, projectDrop };
}

/**
 * まとまり（グループ・No Group・作業場所）のいちばん下の「アーカイブ済み」の落とし先: アーカイブしていないチャットを落とすと、確かめてから
 * アーカイブする（groupId があればそのグループへも移す。ほかのグループのアーカイブ済みは移すだけ）
 */
export function useBucketArchiveDrop(projectId: number, chats: readonly Chat[], groupId: number | null | undefined) {
  const find = (id: number) => chats.find((c) => c.id === id);
  return useChatDropTarget(
    (id) => {
      const chat = find(id);
      if (chat) void archiveDroppedChat(chat, groupId);
    },
    {
      accepts: (id) => {
        const chat = find(id);
        return chat !== undefined && (!chat.archived_at || (groupId !== undefined && chat.group_id !== groupId));
      },
      passThrough: (id) => isForeignChat(id, projectId),
      // アーカイブするもの（アーカイブしていないチャット）だけ、作業中なら落とせない
      blockedBy: (id) => (find(id)?.archived_at ? null : busyBlockReason(id, "アーカイブ")),
    },
  );
}
