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

