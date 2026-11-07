import type { Project } from "@shared/types";
import { moveDroppedChatToProject } from "@/features/chat/chatActions";
import { useChatDropTargets } from "@/features/group/groups";
import { knownChat } from "@/stores/chats";
import { busyBlockReason } from "@/features/chat/chatBusy";

/** ほかのプロジェクトのチャットか（知らないチャットは違うとみなす） */
export function isForeignChat(chatId: number, projectId: number): boolean {
  const chat = knownChat(chatId);
  return chat !== undefined && chat.project_id !== projectId;
}

/**
 * サイドバーのプロジェクトを、ほかのプロジェクトのチャットの落とし先にする（縦並びのプロジェクトのまとまり・スライドの丸。key はプロジェクトの ID）。
 * 落とすと、確かめてからそのプロジェクトへ移す（confirmMoveChatToProject。右クリックの「プロジェクトを変更」と同じ確かめ）。
 * 同じプロジェクトのチャットは受けない（中のグループ・アーカイブ済みなどの落とし先に任せる）。作業中のチャットは落とせない（blockedAt に理由）
 */
export function useProjectChatDrops(projectOf: (id: number) => Project | undefined) {
  return useChatDropTargets<number>(
    (chatId, projectId) => {
      const chat = knownChat(chatId);
      const project = projectOf(projectId);
      if (chat && project) moveDroppedChatToProject(chat, project);
    },
    // 作業中のチャット（子孫も）は移せないので、落とせないことを見せる（赤い枠とカーソルの横の理由）
    { accepts: isForeignChat, blockedBy: (chatId) => busyBlockReason(chatId, "移動") },
  );
}
