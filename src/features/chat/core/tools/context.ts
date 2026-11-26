// AI のツールが呼ばれるたびに、呼んだチャットと相手のチャットを店から引き直す補助（作業の途中で消された・移ったチャットも次の呼び出しから効く）
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { ChatStoreDeps } from "@/features/chat/core/stores";

/** 呼んだチャットが店にないときの文（どのツールも同じ） */
const CHAT_GONE = "このチャットが見つかりません（消された可能性があります）";

/** chatId のチャットの AI が呼んだツールの文脈 */
export function toolChat(chats: Pick<ChatStoreDeps["chats"], "get">, chatId: number) {
  /** within（呼んだチャットから指すプロジェクト）のどれかのチャット（なければ・ほかのプロジェクトなら、notFound の理由の文で throw） */
  const chatIn = (id: number, within: readonly Pick<Project, "id">[], notFound: () => string): Chat => {
    const target = chats.get(id);
    if (!target || !within.some((p) => p.id === target.project_id)) throw new Error(notFound());
    return target;
  };
  return {
    /** 呼んだチャット（なければ理由の文で throw） */
    self(): Chat {
      const chat = chats.get(chatId);
      if (!chat) throw new Error(CHAT_GONE);
      return chat;
    },
    chatIn,
    /** 呼んだチャットと同じプロジェクトのチャット（なければ・ほかのプロジェクトなら、hint を添えた理由の文で throw） */
    chatInProject: (self: Chat, id: number, hint: string): Chat => chatIn(id, [{ id: self.project_id }], () => `チャット ID ${id} は、このプロジェクトにありません。${hint}`),
  };
}
