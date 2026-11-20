/**
 * Kickoff のゴミ箱（v1）。中身のファイルは保存先の trash/<id>/ に置き、ここには元の場所・だれが消したかなどを持つ。id は置き場のフォルダ名（uuid）。
 * kind（file / chat / project / session）は CHECK にしない。chat_id はゴミ箱に入れたチャット（FK なし）。trashed_at は片付けと同じ時計で入れる側が付ける（既定を持たない）
 */
export const TRASH_SCHEMA_V1 = `
CREATE TABLE trash_items (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind <> ''),
  label TEXT NOT NULL CHECK (label <> ''),
  origin TEXT CHECK (origin <> ''),
  is_dir INTEGER NOT NULL DEFAULT 0 CHECK (is_dir IN (0, 1)),
  size INTEGER CHECK (size IS NULL OR size >= 0),
  chat_id INTEGER,
  by_chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  details TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details) AND json_type(details) = 'object'),
  trashed_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_trash_items_project ON trash_items(project_id, trashed_at);
CREATE INDEX idx_trash_items_trashed ON trash_items(trashed_at);
`;
