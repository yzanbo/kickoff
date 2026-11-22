import { useKnownChat } from "@/features/chat/ui/store/knownChats";
import { newChildTab, openTab, parsePanelKey, surfaceOf } from "@/features/panel/ui";
import type { PanelController } from "@/features/panel/ui/usePanel";

/**
 * 欄の「新しい子チャット」を開く操作（欄の決まりの newChild の欄 = サブエージェントの欄で、欄のチャットが子チャットを作れるときだけ。ほかは null）。
 * 作れないのは、欄のチャットが分からない・ノートのチャット・アーカイブ済み（チャット欄の「新規の子チャットに送る」と同じ）
 */
export function useNewChild(panel: PanelController): (() => void) | null {
  const at = parsePanelKey(panel.key);
  const chatId = at && surfaceOf(at.surface)?.newChild && typeof at.scope === "number" ? at.scope : 0;
  const chat = useKnownChat(chatId);
  if (!chat || chat.note_path || chat.archived_at !== null) return null;
  return () => openTab(panel.key, newChildTab({ chatId: chat.id, projectId: chat.project_id }));
}
