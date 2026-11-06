import { useKnownChat } from "@/stores/chats";
import { parsePanelKey, SURFACES } from "@/features/panel/surfaces";
import type { PanelController } from "@/features/panel/usePanel";

/**
 * 欄の「新しい子チャット」を開く操作（SURFACES の newChild の欄 = サブエージェントの欄で、欄のチャットが子チャットを作れるときだけ。ほかは null）。
 * 作れないのは、欄のチャットが分からない・メモのチャット・アーカイブ済み（チャット欄の「新規の子チャットに送る」と同じ）
 */
export function useNewChild(panel: PanelController): (() => void) | null {
  const at = parsePanelKey(panel.key);
  const chatId = at && SURFACES[at.surface].newChild && at.scope !== "all" ? at.scope : 0;
  const chat = useKnownChat(chatId);
  if (!chat || chat.memo_path || chat.archived_at !== null) return null;
  return () => panel.openNewChild({ chatId: chat.id, projectId: chat.project_id });
}
