// 送信待ちの、指示の代わりに挟む行（会話の圧縮・コンテキストの消去）の見分け
import type { QueueAction, QueuedMessage } from "@shared/types";

/** 指示の代わりに挟む行ならその種類（ふつうの指示なら null） */
export function queueActionOf(m: QueuedMessage): QueueAction | null {
  if (m.compact) return "compact";
  if (m.clear) return "clear";
  return null;
}

/** 指示の代わりに挟む行か（書き直せず、まとめる・まとめて送るでは除いて列に残す） */
export function isQueueAction(m: QueuedMessage): boolean {
  return queueActionOf(m) !== null;
}
