// 画面に出す作業中の様子: コアの ChatLive に、停止を押した直後からの「停止中」だけを足す（押してからコアの知らせが届くまでの間も止めているように見せる）
import { useMemo } from "react";
import type { ChatLive } from "@shared/chat/chatLive";
import { createCell, useCell } from "@/foundation/ui/store";
import { useChatDetail } from "@/features/chat/ui";

/** 停止を押して、止まるのを待っているチャット（同じチャットを何か所で開いていても同じ。止まったら外す） */
const pressed = createCell<ReadonlySet<number>>(new Set());

/** 停止を押した・止まった（失敗したら戻す） */
export function setStopPressed(chatId: number, on: boolean) {
  pressed.set((prev) => {
    if (prev.has(chatId) === on) return prev;
    const next = new Set(prev);
    if (on) next.add(chatId);
    else next.delete(chatId);
    return next;
  });
}

/** 画面に出す作業中の様子（作業中で停止を押していれば、コアの知らせより先に停止中） */
export function useScreenLive(chatId: number): ChatLive {
  const { live, chat } = useChatDetail(chatId);
  const busy = chat?.status === "running";
  const stopClicked = useCell(pressed, (set) => set.has(chatId));
  return useMemo(() => {
    const stopping = busy && (stopClicked || live.stopping);
    return stopping === live.stopping ? live : { ...live, stopping };
  }, [live, busy, stopClicked]);
}
