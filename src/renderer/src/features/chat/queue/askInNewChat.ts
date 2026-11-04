// 送信待ちの指示を、新しいチャットで聞く（右クリックのメニュー。文と添付（画像も）を新しいチャットのタブの入力欄に入れて開く）
import type { Attachment, QueuedMessage } from "@shared/types";
import { api } from "@/api";
import { reportFailure } from "@/ui/dialogs";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";

/** 新しいチャットの入力欄に、初めに入れておくもの（送信待ちの指示から始めるとき） */
export interface NewChatSeed {
  text: string;
  attachments: Attachment[];
}

/** 選んだ指示（列の順に、文は空行を挟んでつなぎ、添付は順に並べる）を 1 つの初めの入力にする */
export function seedOf(queue: QueuedMessage[], ids: string[]): NewChatSeed {
  const picked = queue.filter((m) => ids.includes(m.id));
  return {
    text: picked
      .map((m) => m.text.trim())
      .filter(Boolean)
      .join("\n\n"),
    attachments: picked.flatMap((m) => m.attachments),
  };
}

/**
 * 送信待ちの指示を新しいチャットで聞く操作（チャットのタブが入っているパネルの外では undefined で、メニューに出さない）。
 * 作成先は元のチャットと同じプロジェクト・グループ（新しいチャットの見出しで選び直せる）。
 * remove: 送信待ちから外す（新しいチャットへ移す）/ 外さない（元のチャットでも、このあと送る）
 */
export function useAskInNewChat(queue: QueuedMessage[]) {
  const { chatId, askInNewChat } = useChatPane();
  if (!askInNewChat) return undefined;
  return (ids: string[], remove: boolean) => {
    askInNewChat(seedOf(queue, ids));
    if (!remove) return;
    const fail = reportFailure("送信待ちから外せませんでした");
    void (ids.length === 1 ? api.removeQueued(chatId, ids[0]) : api.removeQueuedMany(chatId, ids)).catch(fail);
  };
}
