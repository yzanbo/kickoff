// チャットを開く行き先（open({ kind: "chat" })。子チャットを設定の開き方で開く place はまだ受けない）
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate } from "@/foundation/ui/navigation/router";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** チャット（プロジェクトのボードへ移り、右側のパネルで開く。focus はスクロールして強調する発言） */
    chat: { projectId: number; chatId: number; focus?: number };
  }
}

export const chatTarget: OpenTargetHandler<"chat"> = {
  kind: "chat",
  open({ projectId, chatId, focus }, { replace }) {
    navigate({ name: "chat", projectId, chatId, ...(focus ? { focus } : {}) }, { replace });
    return true;
  },
};
