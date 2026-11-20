import { NOW } from "@/foundation/core/db/db";

/**
 * チャット欄の外の画像（v1）。chat_image_hosts はチャットで表示を許可したホスト（押したホストはそのチャットの中だけ覚える）、
 * chat_image_cache はコアが取ってきた画像の覚え書き（中身は保存先の image-cache/<チャット>/<key>。key は URL の SHA-256。合計の大きさで古いものから消す）。
 * どちらもチャットを本当に消したら一緒に消える（ファイルはゴミ箱の片付けが消す）
 */
export const REMOTE_IMAGES_SCHEMA_V1 = `
CREATE TABLE chat_image_hosts (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  host TEXT NOT NULL CHECK (host <> ''),
  allowed_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (chat_id, host)
) STRICT;
CREATE TABLE chat_image_cache (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key <> ''),
  host TEXT NOT NULL CHECK (host <> ''),
  content_type TEXT NOT NULL CHECK (content_type <> ''),
  size INTEGER NOT NULL CHECK (size >= 0),
  fetched_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (chat_id, key)
) STRICT;
CREATE INDEX idx_chat_image_cache_fetched ON chat_image_cache(fetched_at);
`;
