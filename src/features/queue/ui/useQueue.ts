import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { QueueState } from "@shared/chat/chatLive";
import type { QueuedMessage } from "@shared/chat/types";
import { isQueueAction } from "@shared/chat/queueActions";
import { chatQueueApi } from "@/features/chat/ui";
import { createQueueController, queueViewOf, type QueueController } from "./queueController";
import { queueFailed } from "./queueFailed";

/** 送った指示がほかの所に出なくても「送信中」をやめるまでの時間（送れなかったときの保険） */
const SENDING_MS = 3000;

/** そのチャットの送信待ちの口（取り決めの POST …/queue・…/queue/send を呼ぶ） */
function controllerOf(chatId: number): QueueController {
  return createQueueController({
    run: (commands) => chatQueueApi("POST /api/chats/:chatId/queue", { params: { chatId }, body: { commands } }),
    send: (body) => chatQueueApi("POST /api/chats/:chatId/queue/send", { params: { chatId }, body }),
    failed: queueFailed,
  });
}

/**
 * 送信待ちの口と、画面に出す並び（コアの並びに先回りを重ねたもの）と、送った指示（sending）。
 * shown は送った指示が出る所の印（sentShownKey）
 */
export function useQueue(chatId: number, state: QueueState, shown: string) {
  const c = useMemo(() => controllerOf(chatId), [chatId]);
  const pending = useSyncExternalStore(c.subscribe, c.pending);
  useEffect(() => c.settle(state), [c, state]);
  const sending = useSendingRows(c, state.messages, shown);
  return { c, view: queueViewOf(state, pending), sending };
}

/** 送った指示: shown は消えた時点で画面が知っていた「送った指示が出る所」の印（これが変わったら出し終える） */
interface Sending {
  message: QueuedMessage;
  shown: string;
}

/**
 * 送信待ちから消えた指示のうち、送ったもの（この画面で消した・まとめた・移したものと、挟む行は除く）を、
 * その指示が画面のほかの所に出るまで（流れの自分の発言・預かりの吹き出し）「送信中」として残す。
 * コアは送信待ちから外してから発言を記録するので、そのままだと送った指示が送信待ちからもチャット欄からも消えて見える間ができる
 */
function useSendingRows(c: QueueController, messages: QueuedMessage[], shown: string): QueuedMessage[] {
  const [sending, setSending] = useState<Sending[]>([]);
  // 前に描いたときの送信待ちと、そのときの印（送信待ちの知らせと発言の知らせが一緒に届いても見分けられるように）
  const [prev, setPrev] = useState({ messages, shown });
  if (prev.messages !== messages || prev.shown !== shown) {
    setPrev({ messages, shown });
    const gone = prev.messages === messages ? [] : prev.messages.filter((m) => !isQueueAction(m) && !messages.some((x) => x.id === m.id) && !c.removedHere(m.id));
    // 消えたのと同じ描き直しで、もうほかの所に出ていれば残さない
    if (gone.length > 0 && shown === prev.shown) {
      setSending((list) => [...gone.map((message) => ({ message, shown: prev.shown })), ...list]);
    }
  }
  // 出し終えたもの（ほかの所に出た）を片付け、出ないものも少し待ってやめる
  useEffect(() => {
    if (sending.length === 0) return;
    if (sending.some((s) => s.shown !== shown)) {
      setSending((list) => list.filter((s) => s.shown === shown));
      return;
    }
    const timer = window.setTimeout(() => setSending([]), SENDING_MS);
    return () => window.clearTimeout(timer);
  }, [sending, shown]);
  // 送信待ちに戻ったもの（送れずに戻した）は出さない
  return sending.filter((s) => s.shown === shown && !messages.some((m) => m.id === s.message.id)).map((s) => s.message);
}
