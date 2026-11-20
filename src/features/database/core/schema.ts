import { NOW } from "@/foundation/core/db/db";

/**
 * DB クライアント（v1）。接続はプロジェクトごとの並び。パスワードは secrets の db_connection:<id>:password・ai_password・ssh_password に置き、
 * 接続を消したら（プロジェクトごとの削除も）トリガーで消す。worktree_path は Docker タブの「DB で開く」で作った接続のワークツリー、
 * memo_path は手順のノート（ノートのフォルダからの相対）、prep は準備のコマンド・prep_confirmed は確かめた中身の写し、write_check は書き込む前の確かめ。
 * 履歴（ran_by は user / ai）と準備の記録は接続ごとに新しいものだけ残す。ER 図の位置は接続と場所（DB・スキーマ）ごと
 */
export const DATABASE_SCHEMA_V1 = `
CREATE TABLE db_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  engine TEXT NOT NULL,
  environment TEXT NOT NULL,
  host TEXT CHECK (host <> ''),
  port INTEGER CHECK (port > 0),
  database TEXT CHECK (database <> ''),
  username TEXT CHECK (username <> ''),
  file_path TEXT CHECK (file_path <> ''),
  worktree_path TEXT CHECK (worktree_path <> ''),
  ssl TEXT CHECK (json_valid(ssl) AND json_type(ssl) = 'object'),
  ssh TEXT CHECK (json_valid(ssh) AND json_type(ssh) = 'object'),
  prep TEXT CHECK (json_valid(prep) AND json_type(prep) = 'object'),
  prep_confirmed TEXT CHECK (prep_confirmed <> ''),
  memo_path TEXT CHECK (memo_path <> ''),
  ai_access TEXT NOT NULL,
  ai_username TEXT CHECK (ai_username <> ''),
  read_only INTEGER NOT NULL CHECK (read_only IN (0, 1)),
  write_check TEXT NOT NULL DEFAULT 'dangerous',
  check_on TEXT CHECK (check_on <> ''),
  check_note TEXT CHECK (check_note <> ''),
  position INTEGER NOT NULL,
  last_connected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_db_connections_project ON db_connections(project_id, position);
CREATE TRIGGER db_connections_drop_secrets AFTER DELETE ON db_connections BEGIN
  DELETE FROM secrets WHERE key LIKE 'db_connection:' || OLD.id || ':%';
END;
CREATE TABLE db_query_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  sql TEXT NOT NULL CHECK (sql <> ''),
  ran_by TEXT NOT NULL,
  chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  duration_ms INTEGER,
  row_count INTEGER,
  error TEXT,
  ran_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_db_query_history_connection ON db_query_history(connection_id, id);
CREATE TABLE db_er_layouts (
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  place TEXT NOT NULL CHECK (place <> ''),
  positions TEXT NOT NULL CHECK (json_valid(positions) AND json_type(positions) = 'object'),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (connection_id, place)
) STRICT;
CREATE TABLE db_prep_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  command TEXT NOT NULL CHECK (command <> ''),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  ran_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_db_prep_runs_connection ON db_prep_runs(connection_id, id);
`;
