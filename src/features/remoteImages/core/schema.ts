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

/**
 * ノートの外の画像（v3）。note_image_scopes はノート 1 つ（プロジェクトとノートのフォルダからの相対のパス）で、許可と覚え書きはこの行にぶら下げる
 * （ノートを動かしたら path を書き換えるだけで、許可も覚えた画像も付いていく。覚えた画像は image-cache/notes/<scope_id>/<key>）。
 * note_image_hosts はそのノートで表示を許可したホスト、note_image_cache は取ってきた画像の覚え書き。
 * プロジェクトを消したら一緒に消え、ノートをゴミ箱に入れたら行ごと消す（ファイルは呼ぶ側が消す）。
 * id は使い回さない（AUTOINCREMENT）: 覚えた画像のフォルダ名なので、消した範囲のファイルが片付く前に、同じ ID の新しい範囲が引き継がないように
 */
export const REMOTE_IMAGES_SCHEMA_V3 = `
CREATE TABLE note_image_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK (path <> ''),
  UNIQUE (project_id, path)
) STRICT;
CREATE TABLE note_image_hosts (
  scope_id INTEGER NOT NULL REFERENCES note_image_scopes(id) ON DELETE CASCADE,
  host TEXT NOT NULL CHECK (host <> ''),
  allowed_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (scope_id, host)
) STRICT;
CREATE TABLE note_image_cache (
  scope_id INTEGER NOT NULL REFERENCES note_image_scopes(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key <> ''),
  host TEXT NOT NULL CHECK (host <> ''),
  content_type TEXT NOT NULL CHECK (content_type <> ''),
  size INTEGER NOT NULL CHECK (size >= 0),
  fetched_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (scope_id, key)
) STRICT;
CREATE INDEX idx_note_image_cache_fetched ON note_image_cache(fetched_at);
`;
