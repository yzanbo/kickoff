import { ActiveChatsPalette } from "@/features/chatList/ui";
import { openDraft, useAllDrafts } from "./panelDrafts";

/** ⌘⇧A の一覧（chatList の ActiveChatsPalette）に、このウィンドウの欄にタブのある下書きと、その開き方を渡す */
export function ActiveChatsDialog({ initialProject, onClose }: { initialProject?: number; onClose: () => void }) {
  const drafts = useAllDrafts();
  return <ActiveChatsPalette initialProject={initialProject} drafts={drafts} openDraft={openDraft} onClose={onClose} />;
}
