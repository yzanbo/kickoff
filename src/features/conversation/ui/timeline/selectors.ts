// 流れの項目の取り出し口
import type { ChatEvent } from "@shared/chat/chatEvent";
import { defineChatSelector, memoLast } from "@/features/chat/ui";
import { groupEvents, type TimelineItem } from "./timelineItems";

/**
 * 流れの項目（末尾、遠い発言へ移ったときは途中の一部分を groupEvents でまとめたもの。前に起動したサブエージェントは preface で数える）。
 * 記録が変わったときだけ作り直す
 */
export const timelineItems = defineChatSelector(["log"], () => {
  const items = memoLast((events: ChatEvent[], preface: readonly ChatEvent[], partialHead: boolean): TimelineItem[] => groupEvents(events, undefined, { preface, partialHead }));
  return (src, chatId) => {
    const { events, preface, headPartial } = src.log(chatId);
    return items(events, preface, headPartial);
  };
});
