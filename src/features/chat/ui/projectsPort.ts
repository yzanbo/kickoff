// chat が projects に渡すもの: 口 projectChats の実装（プロジェクトの並び・画面・右サイドバー・フォルダの変更が読むチャット）と、
// 新しいプロジェクトを作ったあとにチャットを移す処理（チャットのメニューの「プロジェクトを変更」→「新規プロジェクト」）
import { defineNewProjectAfter, type ProjectChat, type ProjectChats } from "@/features/projects/ui";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { confirmMoveChatToProject } from "./chatActions";
import { currentChats, knownChat, useChats, useChatsValue, useKnownChat } from "./store/knownChats";

declare module "@/features/projects/ui/new/openNewProject" {
  interface NewProjectAfterMap {
    /** そのチャットを作ったプロジェクトへ移す（確かめてから） */
    moveChat: { chatId: number };
  }
}

function useChatsValueOf<T extends string | number>(select: (chats: readonly ProjectChat[]) => T, enabled: boolean): T | undefined {
  return useChatsValue(select, enabled);
}

function useLoad(projectId: number) {
  const { loaded, loading, error } = useChats({ projectId });
  return { loaded, loading, error };
}

function useKnown(id: number) {
  return useKnownChat(id);
}

export const chatsForProjects: ProjectChats = {
  useKnownChat: useKnown,
  currentChats: (projectId) => currentChats({ projectId }),
  useChatsValue: useChatsValueOf,
  useLoad,
};

export const moveChatAfterNewProject = defineNewProjectAfter("moveChat", (after, project) => {
  const chat = knownChat(after.chatId);
  if (chat) void confirmMoveChatToProject(chat, project).catch(reportFailure("チャットを移せませんでした"));
});
