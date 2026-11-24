import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { QueueState } from "@shared/chat/chatLive";
import { chatQueueApi } from "@/features/chat/ui";
import { createQueueController, queueViewOf, type QueueController } from "./queueController";
import { queueFailed } from "./queueFailed";

/** そのチャットの送信待ちの口（取り決めの POST …/queue・…/queue/send を呼ぶ） */
function controllerOf(chatId: number): QueueController {
  return createQueueController({
    run: (commands) => chatQueueApi("POST /api/chats/:chatId/queue", { params: { chatId }, body: { commands } }),
    send: (body) => chatQueueApi("POST /api/chats/:chatId/queue/send", { params: { chatId }, body }),
    failed: queueFailed,
  });
}

/** 送信待ちの口と、画面に出す並び（コアの並びに先回りを重ねたもの） */
export function useQueue(chatId: number, state: QueueState) {
  const c = useMemo(() => controllerOf(chatId), [chatId]);
  const pending = useSyncExternalStore(c.subscribe, c.pending);
  useEffect(() => c.settle(state), [c, state]);
  return { c, view: queueViewOf(state, pending) };
}
