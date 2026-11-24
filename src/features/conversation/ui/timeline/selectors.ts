// 流れの項目と、項目に載せないで記録から作るもの（作業の終わりの付け足し・AI が作ったチャット）の取り出し口
import type { ChatEvent } from "@shared/chat/chatEvent";
import { defineChatSelector, memoLast } from "@/features/chat/ui";
import { groupEvents, type TimelineItem } from "@/features/conversation/ui/timelineItems";
import { createdChatsByUser, turnExtrasOf, type TurnExtras } from "./turnExtras";

/**
 * 流れの項目（末尾、遠い発言へ移ったときは途中の一部分を groupEvents でまとめたもの。前に起動したサブエージェントは preface で数える）。
 * 記録が変わったときだけ作り直し、中身が同じ項目は前の物のまま
 */
export const timelineItems = defineChatSelector(["log"], () => {
  let prev: TimelineItem[] | undefined;
  const items = memoLast((events: ChatEvent[], preface: readonly ChatEvent[]): TimelineItem[] => (prev = groupEvents(events, undefined, { preface, prev })));
  return (src, chatId) => {
    const { events, preface } = src.log(chatId);
    return items(events, preface);
  };
});

/** 作業の終わりの記録の ID → 付け足し（作業の終わりの行は自分の分だけを useWith で読む。終わった作業の分は前の物のまま） */
export const turnExtras = defineChatSelector(["log"], () => {
  let prev: ReadonlyMap<number, TurnExtras> | undefined;
  const extras = memoLast((events: ChatEvent[], partialHead: boolean) => (prev = turnExtrasOf(events, { partialHead, prev })));
  return (src, chatId) => {
    const { events, headPartial } = src.log(chatId);
    return extras(events, headPartial);
  };
});

const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** 自分の発言の記録の ID → その作業で AI が作った兄弟チャット・親のないチャット（発言の行は自分の分だけを読む。変わらない分は前の配列のまま） */
export const createdChats = defineChatSelector(["log"], () => {
  let prev = new Map<number, number[]>();
  const created = memoLast((events: ChatEvent[]): ReadonlyMap<number, readonly number[]> => {
    const next = createdChatsByUser(events);
    for (const [id, chats] of next) {
      const old = prev.get(id);
      if (old && sameIds(old, chats)) next.set(id, old);
    }
    return (prev = next);
  });
  return (src, chatId) => created(src.log(chatId).events);
});
