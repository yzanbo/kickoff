// childChats がアプリの根に置く物: チャットの AI が頼んだ下書きを家系のチャットの入力欄に入れる（kickoff_chat の add_draft）と、
// 別ウィンドウから頼まれた子チャットの操作（聞く子チャットを開く・子チャットを開く・子チャットから親へ）の受け手
import { useEffect } from "react";
import type { AppHost } from "@/foundation/ui/shell/points";
import { onWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { knownChat, openAskChild, openChat } from "@/features/chat/ui";
import { useAiDraftRequests } from "./aiDraftRequests";
import { handBackToParent, revealInParent } from "./askChild";

function useChildWindowMessages() {
  useEffect(() => {
    const offs = [
      onWindowMessage("askChild", (m) => openAskChild(m)),
      onWindowMessage("openChild", (m) => {
        const chat = knownChat(m.chatId);
        if (chat) openChat(chat, "side");
      }),
      onWindowMessage("childToParent", (m) => {
        const child = knownChat(m.childId);
        if (!child) return;
        if (m.action === "reveal") revealInParent(child);
        else handBackToParent(child, m.text ?? "");
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
}

export const childChatsHosts: AppHost[] = [
  { id: "aiDraftRequests", windows: "main", useEffect: useAiDraftRequests },
  { id: "childChats.windowMessages", windows: "main", useEffect: useChildWindowMessages },
];
