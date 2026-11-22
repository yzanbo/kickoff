// チャットの店の、chat 自身の取り出し口
import { defineChatSelector } from "./useChatStore";

/** いちばん新しいメインの AI の返答の文（サブエージェントの文は除く。なければ ""。子チャットの上の帯の「最新の答えを引用して渡す」） */
export const latestAnswer = defineChatSelector(["log"], () => (src, chatId) => {
  const { tail } = src.log(chatId);
  for (let i = tail.length - 1; i >= 0; i--) {
    const e = tail[i];
    if (e.type === "text" && !e.data.parent) return e.data.text;
  }
  return "";
});
