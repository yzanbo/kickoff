// 入力欄の取り出し口
import type { ChatEvent } from "@shared/chat/chatEvent";
import { defineChatSelector, memoLast } from "@/features/chat/ui";

/** 音声モードで読み上げる候補の 1 件 */
export interface VoiceReply {
  id: number;
  text: string;
}

/**
 * 音声モードで読み上げる候補（メインエージェントの文章の返答。記録全体から作るが、索引の返答は文を空にした軽い形なので除く）
 */
export const voiceReplies = defineChatSelector(["log"], () => {
  const replies = memoLast((events: ChatEvent[]): VoiceReply[] => events.flatMap((e) => (e.type === "text" && !e.data.parent && e.data.text ? [{ id: e.id, text: e.data.text }] : [])));
  return (src, chatId) => replies(src.log(chatId).digest);
});

/** いちばん新しい自分の発言の ID（送信待ちから送った指示を、どこかに出るまで「送信中」で残す印。なければ 0） */
export const lastUserEventId = defineChatSelector(["log"], () => (src, chatId) => {
  const { digest } = src.log(chatId);
  for (let i = digest.length - 1; i >= 0; i--) if (digest[i].type === "user") return digest[i].id;
  return 0;
});
