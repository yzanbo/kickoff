// 図の取り出し口（チャットの店の記録から組み立てる）
import { defineChatSelector, memoLast } from "@/features/chat/ui";
import { chatVisualsOf } from "./visualsContext";

/** AI が描いた図（記録から組み立てたもの。流れの図の項目が読む） */
export const chatVisuals = defineChatSelector(["log"], () => {
  const of = memoLast(chatVisualsOf);
  return (src, chatId) => of(src.log(chatId).digest);
});
