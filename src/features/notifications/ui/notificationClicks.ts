import { useEffect } from "react";
import { api } from "@/foundation/ui/api";
import { openChat } from "@/features/chat/ui";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { onNotificationClick } from "./native";

/** Mac の通知が押されたら開く（チャットは子チャット・ノートのチャットならその開き方で。Kickoff を起動し直したあとに前の通知が押されたときも） */
export function useNotificationTargets() {
  useEffect(
    () =>
      onNotificationClick({
        chat: (projectId, chatId) => void openNotifiedChat(projectId, chatId),
        ci: (projectId, runId) => openTarget({ kind: "ciRun", projectId, runId }),
      }),
    [],
  );
}

/** 通知のチャットを開く（子チャットなら設定の開き方、ノートのチャットならそのノート。読めなければいちばん上のチャットとして） */
async function openNotifiedChat(projectId: number, chatId: number) {
  const chat = await api.chatDetail(chatId, { limit: 1 }).then(
    (d) => d.chat,
    () => null,
  );
  if (!chat) return openTarget({ kind: "chat", projectId: projectId, chatId: chatId });
  if (chat.note_path !== null) return openTarget({ kind: "note", projectId: chat.project_id, path: chat.note_path });
  openChat(chat);
}
