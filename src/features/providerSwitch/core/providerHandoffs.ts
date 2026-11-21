// AI を替えた引き継ぎの保存（chat_provider_handoffs・chat_provider_sessions の店）と、chat が読む口 ProviderHandoffPort・作業の終わりの行き先 handoffAfterTurn
import type { DatabaseSync } from "node:sqlite";
import type { ProviderHandoffPort } from "@/features/chat/core/index";
import { createChatProviderHandoffStore, handoffBlocksSwitch } from "./db/handoffs";
import { createChatProviderSessionStore } from "./db/sessions";

/** 引き継ぎと、離れた AI のセッションの覚えの店 */
export function createProviderHandoffStores(db: DatabaseSync) {
  return { chatProviderHandoffs: createChatProviderHandoffStore(db), chatProviderSessions: createChatProviderSessionStore(db) };
}

export type ProviderHandoffStores = ReturnType<typeof createProviderHandoffStores>;

/** 引き継ぎの行き先: 届いた complete・送ったあとの失敗や中断は受信不明 uncertain・送る前に止まったら再試行待ち（記録した指示の送り直しなら block_before_send） */
export type HandoffAfterTurn = "complete" | "uncertain" | "block_before_send" | "block_ready";

/**
 * 作業の終わり（とやり直しの失敗）で引き継ぎをどうするか（純粋）。sent = 送信中の印を取って AI を動かした・completed = 最後まで終わってセッションがある・
 * resend = 記録した指示を送り直す作業だった。送ったあとは二重に送らないよう、確かめるまで送り直さない
 */
export function handoffAfterTurn(t: { sent: boolean; completed: boolean; resend: boolean }): HandoffAfterTurn {
  if (t.sent) return t.completed ? "complete" : "uncertain";
  return t.resend ? "block_before_send" : "block_ready";
}

/** chat が読む引き継ぎの口（組み立てが chat を作る前に作って渡す。起動のときの確かめが chat を作る中で走るため） */
export function providerHandoffPortOf(s: ProviderHandoffStores): ProviderHandoffPort {
  return {
    pending: (chatId) => s.chatProviderHandoffs.get(chatId) ?? null,
    blocksSwitch: (chatId, current) => handoffBlocksSwitch(s.chatProviderHandoffs.get(chatId), current),
    failed: (chatId, eventId, error, resend) => {
      if (handoffAfterTurn({ sent: false, completed: false, resend }) === "block_before_send") s.chatProviderHandoffs.blockBeforeSend(chatId, eventId, error);
      else s.chatProviderHandoffs.blockReady(chatId, eventId, error);
    },
    confirmResend: (chatId, eventId) => s.chatProviderHandoffs.confirmResend(chatId, eventId),
    onBoot: () => void s.chatProviderHandoffs.recoverInterrupted(),
    cleared: (chatId) => s.chatProviderSessions.removeAll(chatId),
    sessionsOf: (chatId) => s.chatProviderSessions.list(chatId),
  };
}

/** 引き継ぎの店と、chat に渡す口（組み立てが chat の前に作り、createProviderSwitch にも渡す） */
export function createProviderHandoffs(db: DatabaseSync) {
  const stores = createProviderHandoffStores(db);
  return { stores, port: providerHandoffPortOf(stores) };
}
