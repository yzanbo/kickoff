// ToDo の取り出し口
import type { ChatEvent } from "@shared/chat/chatEvent";
import { defineChatSelector, memoLast } from "@/features/chat/ui";
import { collectTodoList, type TodoList } from "./todoList";

/** エージェントが付けた作業の一覧（記録全体から作る。記録が変わったときだけ作り直す） */
export const todoList = defineChatSelector(["log"], () => {
  const list = memoLast((events: readonly ChatEvent[]): TodoList => collectTodoList(events));
  return (src, chatId) => list(src.log(chatId).digest);
});
