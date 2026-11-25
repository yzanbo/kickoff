import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { useChatDropTargets } from "@/features/chatList/ui";
import { moveDroppedChatToProject, knownChat, busyBlockReason } from "@/features/chat/ui";

/** そのプロジェクト（共通も）へ落として移せるチャットか: ほかのプロジェクトのチャットだけ（知らないチャットは受けない）。純粋 */
export const acceptsProjectDrop = (chat: Pick<Chat, "project_id"> | undefined, projectId: number): boolean => chat !== undefined && chat.project_id !== projectId;

/** ほかのプロジェクトのチャットか（知らないチャットは違うとみなす） */
export const isForeignChat = (chatId: number, projectId: number): boolean => acceptsProjectDrop(knownChat(chatId), projectId);

/**
 * サイドバーのプロジェクトを、ほかのプロジェクトのチャットの落とし先にする（縦並びのプロジェクトのまとまり・スライドの丸・共通の枠。key はプロジェクトの ID）。
 * 落とすと、確かめてからそのプロジェクトへ移す（confirmMoveChatToProject。右クリックの「プロジェクトを変更」と同じ確かめ）。
 * 共通とプロジェクトの間も両方向に移せる（共通へ移すと作業フォルダで動き、ワークツリー・グループは外れる）。
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
