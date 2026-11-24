import { NOW } from "@/foundation/core/db/db";
import { col, table } from "@/foundation/core/db/table";
import type { DbAiAccess, DbEngine, DbEnvironment, DbErPositions, DbPrep, DbPrepKind, DbQueryRanBy, DbSsh, DbSsl, DbWriteCheck } from "@shared/database/types";
import { dbSecretKeySql } from "./secretKeys";

/**
 * DB クライアント（v1）。接続はプロジェクトごとの並び。パスワードは secrets の db_connection:<id>:password・ai_password・ssh_password に置き、
 * 接続を消したら（プロジェクトごとの削除も）トリガーで消す。worktree_path は Docker タブの「DB で開く」で作った接続のワークツリー、
 * note_path は手順のノート（ノートのフォルダからの相対）、prep は準備のコマンド・prep_confirmed は確かめた中身の写し、write_check は書き込む前の確かめ。
 * 履歴（ran_by は user / ai）と準備の記録は接続ごとに新しいものだけ残す。ER 図の位置は接続と DB の場所 scope（DB・スキーマ。API では place）ごと
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
  note_path TEXT CHECK (note_path <> ''),
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
  DELETE FROM secrets WHERE key LIKE ${dbSecretKeySql("OLD.id", "%")};
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
  scope TEXT NOT NULL CHECK (scope <> ''),
  positions TEXT NOT NULL CHECK (json_valid(positions) AND json_type(positions) = 'object'),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (connection_id, scope)
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

/**
 * 接続の列（パスワードを保存したかは秘密の値から店が添える。prep_confirmed は確かめた中身の写しの文字で、店がいまの中身と比べて真偽にする）。
 * 並びはプロジェクトごとに 0 から。updated_at は中身を変えたときだけ店が進める（つながった時刻・確かめでは進めない）
 */
export const dbConnectionsTable = table(
  "db_connections",
  {
    id: col.int(),
    project_id: col.int(),
    name: col.text(),
    engine: col.text<DbEngine>(),
    environment: col.text<DbEnvironment>(),
    host: col.text().nullable(),
    port: col.int().nullable(),
    database: col.text().nullable(),
    username: col.text().nullable(),
    file_path: col.text().nullable(),
    worktree_path: col.text().nullable(),
    ssl: col.json<DbSsl>().nullable(),
    ssh: col.json<DbSsh>().nullable(),
    prep: col.json<DbPrep>().nullable(),
    prep_confirmed: col.text().nullable(),
    note_path: col.text().nullable(),
    ai_access: col.text<DbAiAccess>(),
    ai_username: col.text().nullable(),
    read_only: col.bool(),
    write_check: col.text<DbWriteCheck>(),
    check_on: col.text().nullable(),
    check_note: col.text().nullable(),
    position: col.int(),
    last_connected_at: col.time().nullable(),
    created_at: col.time(),
    updated_at: col.time(),
  },
  { order: "position, id", position: { column: "position", base: 0, group: "project_id" } },
);

/** ER 図の位置（主キーは接続と場所の組なので、引くのは one、書くのは店の upsert） */
export const dbErLayoutsTable = table("db_er_layouts", { connection_id: col.int(), scope: col.text(), positions: col.json<DbErPositions>(), updated_at: col.time() });

/** SQL の履歴（ran_by は user / ai。chat_id はチャットを消したら null） */
export const dbQueryHistoryTable = table(
  "db_query_history",
  {
    id: col.int(),
    connection_id: col.int(),
    sql: col.text(),
    ran_by: col.text<DbQueryRanBy>(),
    chat_id: col.int().nullable(),
    duration_ms: col.int().nullable(),
    row_count: col.int().nullable(),
    error: col.text().nullable(),
    ran_at: col.time(),
  },
  { order: "id DESC" },
);

/** 準備の記録（いつ・どのコマンド・成功 / 失敗だけ） */
export const dbPrepRunsTable = table(
  "db_prep_runs",
  { id: col.int(), connection_id: col.int(), kind: col.text<DbPrepKind>(), command: col.text(), ok: col.bool(), ran_at: col.time() },
  { order: "id DESC" },
);
