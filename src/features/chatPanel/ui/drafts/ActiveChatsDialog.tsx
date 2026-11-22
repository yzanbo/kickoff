import { ActiveChatsPalette, type ActiveChatsRequest } from "@/features/chatList/ui";
import { openDraft, useAllDrafts } from "./panelDrafts";

/**
 * アプリのダイアログの ⌘⇧A の一覧（chatList の ActiveChatsPalette）に、このウィンドウの欄にタブのある下書きと、その開き方を渡す
 * （プロジェクトのボタンから開いたときは、そのプロジェクトで絞り込む）
 */
export function ActiveChatsDialog({ detail, onClose }: { detail: unknown; onClose(): void }) {
  const drafts = useAllDrafts();
  return <ActiveChatsPalette initialProject={(detail as ActiveChatsRequest).projectId} drafts={drafts} openDraft={openDraft} onClose={onClose} />;
}
