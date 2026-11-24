// 失敗した作業の取り出し口
import type { ChatEvent } from "@shared/chat/chatEvent";
import { defineChatSelector, memoLast } from "@/features/chat/ui";
import type { FailedTurn } from "@/features/conversation/ui/rewindContext";
import { failedTurnOf } from "./retryActions";

/** いちばん新しい作業の失敗（記録全体から。なければ undefined） */
export const failedTurn = defineChatSelector(["log"], () => {
  const failed = memoLast((events: ChatEvent[]): FailedTurn | undefined => failedTurnOf(events));
  return (src, chatId) => failed(src.log(chatId).digest);
});
