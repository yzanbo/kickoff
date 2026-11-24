// チャットを開く行き先（open({ kind: "chat" })。place を渡すと、子チャットは設定の開き方・選んだ場所で開く）
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate } from "@/foundation/ui/navigation/router";
import { openChatAt, type ChatOpenPlace } from "./open/openChat";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** チャット（プロジェクトのボードへ移り、右側のパネルで開く。focus はスクロールして強調する発言） */
    chat: { projectId: number; chatId: number; focus?: number; place?: ChatOpenPlace };
  }
}

export const chatTarget: OpenTargetHandler<"chat"> = {
  kind: "chat",
  open({ projectId, chatId, focus, place }, { replace }) {
    if (place && openChatAt(chatId, place)) return true;
    navigate({ name: "chat", projectId, chatId, ...(focus ? { focus } : {}) }, { replace });
    return true;
  },
};
