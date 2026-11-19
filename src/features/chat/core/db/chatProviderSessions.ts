import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "@shared/types";

/** 同じチャットで各 AI に戻したときの再開先と、引き継ぎ済みの記録の位置 */
export interface ChatProviderSession {
  chat_id: number;
  provider: ProviderId;
  session_id: string;
  last_event_id: number | null;
}

/** chats.session_id の通常の更新に追従する。再開先が変わったときのみ引き継ぎ位置を消す。 */
export function syncCurrentChatProviderSession(db: DatabaseSync, chatId: number, sessionId: string | null): void {
  if (sessionId === null) {
    db.prepare("DELETE FROM chat_provider_sessions WHERE chat_id = ? AND provider = (SELECT provider FROM chats WHERE id = ?)").run(chatId, chatId);
    return;
  }
  db.prepare(`INSERT INTO chat_provider_sessions (chat_id, provider, session_id)
    SELECT id, provider, ? FROM chats WHERE id = ?
    ON CONFLICT (chat_id, provider) DO UPDATE SET
      last_event_id = CASE WHEN chat_provider_sessions.session_id = excluded.session_id THEN chat_provider_sessions.last_event_id ELSE NULL END,
      session_id = excluded.session_id`).run(sessionId, chatId);
}

/** この保存先だけでは AI の切り替えは行わない。現在担当の AI・セッションは従来どおり chats が持つ。 */
export function createChatProviderSessionStore(db: DatabaseSync) {
  return {
    get(chatId: number, provider: ProviderId): ChatProviderSession | undefined {
      const row = db.prepare("SELECT * FROM chat_provider_sessions WHERE chat_id = ? AND provider = ?").get(chatId, provider) as unknown as ChatProviderSession | undefined;
      return row ? { ...row } : undefined;
    },
    list(chatId: number): ChatProviderSession[] {
      const rows = db.prepare("SELECT * FROM chat_provider_sessions WHERE chat_id = ? ORDER BY provider").all(chatId) as unknown as ChatProviderSession[];
      return rows.map((row) => ({ ...row }));
    },
    save(chatId: number, provider: ProviderId, sessionId: string, lastEventId: number | null): void {
      db.prepare(`INSERT INTO chat_provider_sessions (chat_id, provider, session_id, last_event_id) VALUES (?, ?, ?, ?)
        ON CONFLICT (chat_id, provider) DO UPDATE SET session_id = excluded.session_id, last_event_id = excluded.last_event_id`).run(chatId, provider, sessionId, lastEventId);
    },
    remove(chatId: number, provider: ProviderId): void {
      db.prepare("DELETE FROM chat_provider_sessions WHERE chat_id = ? AND provider = ?").run(chatId, provider);
    },
    removeAll(chatId: number): void {
      db.prepare("DELETE FROM chat_provider_sessions WHERE chat_id = ?").run(chatId);
    },
  };
}
