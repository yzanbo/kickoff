/**
 * AI を替えて会話を続ける（v1。店は chat の店の束の中）。
 * - chat_provider_sessions: 離れた AI のセッションの覚え（切り替えるときに離れる AI の分を書き、戻る AI の分を読んで消す。いまの AI の分は chats.session_id）。
 *   last_event_id はその AI に引き継ぎ済みの記録の位置
 * - chat_provider_handoffs: 切り替えたあと次の指示までの引き継ぎ（state は ready / blocked / sending / uncertain。値の一覧なので CHECK にしない）
 */
export const PROVIDER_SWITCH_SCHEMA_V1 = `
CREATE TABLE chat_provider_sessions (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider <> ''),
  session_id TEXT NOT NULL CHECK (session_id <> ''),
  last_event_id INTEGER CHECK (last_event_id > 0),
  PRIMARY KEY (chat_id, provider)
) STRICT;
CREATE TABLE chat_provider_handoffs (
  chat_id INTEGER PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES chat_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider <> ''),
  context TEXT NOT NULL CHECK (context <> ''),
  state TEXT NOT NULL,
  error TEXT,
  last_event_id INTEGER CHECK (last_event_id > 0),
  queue_was_paused INTEGER NOT NULL DEFAULT 0 CHECK (queue_was_paused IN (0, 1))
) STRICT;
`;
