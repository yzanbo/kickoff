// チャットの店の、chat 自身の取り出し口（部品は記録の配列を props で受けず、要るものをここか持ち主の取り出し口で読む）
import { memoLast } from "./chatSelector";
import { defineChatSelector } from "./useChatStore";

/** 流れに出す記録の範囲と読み足しの様子（chatWindow） */
export interface ChatWindow {
  /** 末尾の始まりの記録の ID（0 = 最初から読んでいる。チャットの中の検索の本文をこれより前で読む） */
  tailStart: number;
  /** 流れに出す記録より前に、まだ読んでいない記録があるか */
  hasEarlier: boolean;
  /** 途中の一部分を出しているか（下に末尾がある） */
  focused: boolean;
  /** 前・後ろ・遠い所を読んでいる最中か */
  paging: boolean;
  /** 流れに出す記録の最初と最後の ID（何も読んでいなければ null） */
  shown: { first: number; last: number } | null;
}

/** 流れに出す記録の範囲と読み足しの様子（変わったときだけ新しい値） */
export const chatWindow = defineChatSelector(["log"], () => {
  const data = memoLast((tailStart: number, hasEarlier: boolean, focused: boolean, paging: boolean, first: number | null, last: number | null): ChatWindow => ({
    tailStart,
    hasEarlier,
    focused,
    paging,
    shown: first === null || last === null ? null : { first, last },
  }));
  return (src, chatId) => {
    const { tailStart, hasEarlier, focused, paging, events } = src.log(chatId);
    return data(tailStart, hasEarlier, focused, paging, events[0]?.id ?? null, events.at(-1)?.id ?? null);
  };
});

/** 記録の末尾（最新のターンから終わりまで。作業中の行・既読・一番下へ戻るボタン・チャットの中の検索が読む） */
export const chatTail = defineChatSelector(["log"], () => (src, chatId) => src.log(chatId).tail);

/** いちばん新しいメインの AI の返答の文（サブエージェントの文は除く。なければ ""。子チャットの上の帯の「最新の答えを引用して渡す」） */
export const latestAnswer = defineChatSelector(["log"], () => (src, chatId) => {
  const { tail } = src.log(chatId);
  for (let i = tail.length - 1; i >= 0; i--) {
    const e = tail[i];
    if (e.type === "text" && !e.data.parent) return e.data.text;
  }
  return "";
});
