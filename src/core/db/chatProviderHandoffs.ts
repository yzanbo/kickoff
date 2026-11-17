import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "@shared/types";

/** ready = 次の指示に添える、blocked = 準備失敗、sending = 送信開始、uncertain = 受信されたか不明。 */
export type HandoffState = "ready" | "blocked" | "sending" | "uncertain";
export interface ChatProviderHandoff {
  chatId: number;
  eventId: number;
  provider: ProviderId;
  context: string;
  state: HandoffState;
  error: string | null;
  lastEventId: number | null;
  queueWasPaused: boolean;
}

interface HandoffRow {
  chat_id: number;
  event_id: number;
  provider: ProviderId;
  context: string;
  state: HandoffState;
  error: string | null;
  last_event_id: number | null;
  queue_was_paused: number;
}
const fromRow = (r: HandoffRow): ChatProviderHandoff => ({ chatId: r.chat_id, eventId: r.event_id, provider: r.provider, context: r.context, state: r.state, error: r.error, lastEventId: r.last_event_id, queueWasPaused: r.queue_was_paused === 1 });

/** この保存先だけでは送信・再試行を開始しない。 */
export function createChatProviderHandoffStore(db: DatabaseSync) {
  return {
    get(chatId: number): ChatProviderHandoff | undefined {
      const row = db.prepare("SELECT * FROM chat_provider_handoffs WHERE chat_id = ?").get(chatId) as unknown as HandoffRow | undefined;
      return row ? fromRow(row) : undefined;
    },
    save(handoff: ChatProviderHandoff): void {
      db.prepare(`INSERT INTO chat_provider_handoffs (chat_id, event_id, provider, context, state, error, last_event_id, queue_was_paused)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET event_id = excluded.event_id,
        provider = excluded.provider, context = excluded.context, state = excluded.state, error = excluded.error,
        last_event_id = excluded.last_event_id, queue_was_paused = excluded.queue_was_paused`).run(
        handoff.chatId, handoff.eventId, handoff.provider, handoff.context, handoff.state, handoff.error, handoff.lastEventId, handoff.queueWasPaused ? 1 : 0,
      );
    },
    remove(chatId: number): void {
      db.prepare("DELETE FROM chat_provider_handoffs WHERE chat_id = ?").run(chatId);
    },
    /** 実行の直前に 1 回だけ送信中へ進める。別の操作や古い区切りは競合として失敗する。 */
    claim(chatId: number, eventId: number, provider: ProviderId): boolean {
      return db.prepare("UPDATE chat_provider_handoffs SET state = 'sending', error = NULL WHERE chat_id = ? AND event_id = ? AND provider = ? AND state = 'ready'").run(chatId, eventId, provider).changes === 1;
    },
    /** 送信後の状態が分からない場合は自動再送しない（Q45）。 */
    markUncertain(chatId: number, eventId: number, error: string): boolean {
      return db.prepare("UPDATE chat_provider_handoffs SET state = 'uncertain', error = ? WHERE chat_id = ? AND event_id = ? AND state = 'sending'").run(error, chatId, eventId).changes === 1;
    },
    /** 同じ切り替えの送信が無事に完了した場合だけ、保留を外す。 */
    complete(chatId: number, eventId: number): boolean {
      return db.prepare("DELETE FROM chat_provider_handoffs WHERE chat_id = ? AND event_id = ? AND state = 'sending'").run(chatId, eventId).changes === 1;
    },
    /** 前回の終了時に送信中だったものは、起動後に受信不明として利用者の確認を待つ。 */
    recoverInterrupted(): number {
      return Number(db.prepare("UPDATE chat_provider_handoffs SET state = 'uncertain', error = ? WHERE state = 'sending'").run("前回の終了時に送信中だったため、AI が指示を受け取ったか確認できません").changes);
    },
  };
}
