// AI のツールが呼ばれるたびに、呼んだチャットと相手のチャットを店から引き直す補助（作業の途中で消された・移ったチャットも次の呼び出しから効く）
import type { Chat } from "@shared/chat/types";
import type { ChatStoreDeps } from "@/features/chat/core/stores";

/** 呼んだチャットが店にないときの文（どのツールも同じ） */
const CHAT_GONE = "このチャットが見つかりません（消された可能性があります）";

/** chatId のチャットの AI が呼んだツールの文脈 */
export function toolChat(chats: Pick<ChatStoreDeps["chats"], "get">, chatId: number) {
  return {
    /** 呼んだチャット（なければ理由の文で throw） */
    self(): Chat {
      const chat = chats.get(chatId);
      if (!chat) throw new Error(CHAT_GONE);
      return chat;
    },
    /** 呼んだチャットと同じプロジェクトのチャット（なければ・ほかのプロジェクトなら、hint を添えた理由の文で throw） */
    chatInProject(self: Chat, id: number, hint: string): Chat {
      const target = chats.get(id);
      if (!target || target.project_id !== self.project_id) throw new Error(`チャット ID ${id} は、このプロジェクトにありません。${hint}`);
      return target;
    },
  };
}
