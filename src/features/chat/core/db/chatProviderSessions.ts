import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "@shared/settings/types";

/** 同じチャットで離れた AI に戻したときの再開先と、その AI に引き継ぎ済みの記録の位置 */
export interface ChatProviderSession {
  chat_id: number;
  provider: ProviderId;
  session_id: string;
  last_event_id: number | null;
}

/**
 * 離れた AI のセッションの覚え（chat_provider_sessions。providerSwitch の表）。いまの AI のセッションは chats.session_id だけが持ち、
 * ここには行を置かない（切り替えるときに離れる AI の分を書き、戻る AI の分を読んで消す。Store.commitProviderSwitch）
 */
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
