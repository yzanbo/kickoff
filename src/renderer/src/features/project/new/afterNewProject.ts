// 新しいプロジェクトを作ったあとの処理（App の新しいプロジェクトのダイアログが、頼まれた after のとおりに行う）
import type { Project } from "@shared/types";
import { openNewChat } from "@/app/router";
import { knownChat } from "@/stores/chats";
import { reportFailure } from "@/ui/dialogs";
import { confirmMoveChatToProject } from "@/features/chat/chatActions";
import { moveDraftToProject } from "@/features/panel/state/panelDrafts";
import type { NewProjectAfter } from "./openNewProject";

/** 作ったプロジェクトで、頼まれた処理をする（なければ、そのプロジェクトで新しいチャットを開く） */
export function runAfterNewProject(after: NewProjectAfter | undefined, project: Project) {
  if (!after) return openNewChat(project.id);
  if (after.kind === "moveDraft") return moveDraftToProject(after.draft, project.id);
  const chat = knownChat(after.chatId);
  if (chat) void confirmMoveChatToProject(chat, project).catch(reportFailure("チャットを移せませんでした"));
}
