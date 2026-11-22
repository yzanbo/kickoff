// 自分の指示の一覧の取り出し口
import { defineChatSelector } from "@/features/chat/ui";
import { promptListOf } from "./promptHistory";

/** 自分の指示の一覧（記録全体から作る。指示の履歴・⌘⌥↑ / ↓・上に貼り付ける指示の帯・チャット欄の ↑ の呼び出し。記録が変わったときだけ作り直す） */
export const promptList = defineChatSelector(["log"], () => (src, chatId) => promptListOf(src.log(chatId).digest));
