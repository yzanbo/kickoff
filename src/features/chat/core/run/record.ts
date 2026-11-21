// 記録を足す口: 店に足し、足した記録でチャットの作業中の状態の印（marks）を進める（実行の受付・1 回の実行・再開の段取りはここから足す）
import type { ChatEvent, ChatEventData } from "@shared/chat/chatEvent";
import { advanceMarks } from "@/features/chat/core/run/machine/marks";
import type { ChatRuntime } from "@/features/chat/core/runtime";
import type { Store } from "@/features/chat/core/stores";

export function recordEvent(store: Pick<Store, "events">, runtime: ChatRuntime, event: ChatEventData): ChatEvent {
  const saved = store.events.add(runtime.chatId, event);
  runtime.marks = advanceMarks(runtime.marks, saved);
  return saved;
}
