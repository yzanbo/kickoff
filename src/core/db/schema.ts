import type { DatabaseSync } from "node:sqlite";

/** SQLite で今の時刻（ISO 8601・ミリ秒まで）を作る式 */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Kickoff のデータベースの印（PRAGMA application_id。'KICK'）。これがあれば、いまの系統（user_version は USER_VERSION_BASE ＋ 版） */
export const APPLICATION_ID = 0x4b49434b;

/**
 * v1 のスキーマ（docs/architecture.md の「3. スキーマ」）。すべて STRICT。真偽値は 0 / 1、JSON の列は json_valid と json_type で形を確かめる。
 * 値の一覧（状態など）は CHECK にしない（増やすたびに表を作り直すことになるため）。
 * 会話の記録のうち、自分の発言とメインの AI の返答（type が user / サブエージェントでない text）の文は生成列 text に出し、
 * 全文検索の索引 chat_event_search（trigram で部分一致）はビュー chat_event_texts を中身にして、トリガーで追従させる
 */
export const SCHEMA_V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
) STRICT;
CREATE TABLE secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (value <> '')
) STRICT;
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT INTO meta (key, value) VALUES ('database_id', lower(hex(randomblob(16))));
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),
  description TEXT NOT NULL DEFAULT '',
  repo_path TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  position INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  chat_defaults TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(chat_defaults) AND json_type(chat_defaults) = 'object'),
  reference_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reference_paths) AND json_type(reference_paths) = 'array'),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE TABLE chat_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_chat_groups_project ON chat_groups(project_id, position);
CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES chat_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT,
  effort TEXT,
  permission_mode TEXT NOT NULL,
  fast_mode INTEGER NOT NULL DEFAULT 0 CHECK (fast_mode IN (0, 1)),
  worktree_path TEXT CHECK (worktree_path <> ''),
  branch TEXT CHECK (branch <> ''),
  status TEXT NOT NULL,
  error TEXT,
  session_id TEXT,
  turn_started_at TEXT,
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  num_turns INTEGER NOT NULL DEFAULT 0 CHECK (num_turns >= 0),
  context_tokens INTEGER,
  context_window INTEGER,
  unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1)),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  active_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_chats_project ON chats(project_id, archived_at, active_at);
CREATE INDEX idx_chats_worktree ON chats(project_id, worktree_path) WHERE worktree_path IS NOT NULL;
CREATE INDEX idx_chats_group ON chats(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_chats_running ON chats(status) WHERE status = 'running';
CREATE TRIGGER chats_group_project_insert BEFORE INSERT ON chats
WHEN new.group_id IS NOT NULL AND (SELECT project_id FROM chat_groups WHERE id = new.group_id) IS NOT new.project_id
BEGIN
  SELECT RAISE(ABORT, 'chat group belongs to another project');
END;
CREATE TRIGGER chats_group_project_update BEFORE UPDATE OF group_id, project_id ON chats
WHEN new.group_id IS NOT NULL AND (SELECT project_id FROM chat_groups WHERE id = new.group_id) IS NOT new.project_id
BEGIN
  SELECT RAISE(ABORT, 'chat group belongs to another project');
END;
CREATE TABLE chat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  text TEXT GENERATED ALWAYS AS (
    CASE WHEN type = 'user' OR (type = 'text' AND json_extract(data, '$.parent') IS NULL) THEN json_extract(data, '$.text') END
  ) VIRTUAL
) STRICT;
CREATE INDEX idx_chat_events_chat ON chat_events(chat_id, id);
CREATE VIEW chat_event_texts AS SELECT id, text FROM chat_events WHERE text IS NOT NULL;
CREATE VIRTUAL TABLE chat_event_search USING fts5(text, content = 'chat_event_texts', content_rowid = 'id', tokenize = 'trigram');
CREATE TRIGGER chat_events_search_insert AFTER INSERT ON chat_events WHEN new.text IS NOT NULL BEGIN
  INSERT INTO chat_event_search (rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER chat_events_search_delete AFTER DELETE ON chat_events WHEN old.text IS NOT NULL BEGIN
  INSERT INTO chat_event_search (chat_event_search, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER chat_events_search_update AFTER UPDATE OF type, data ON chat_events BEGIN
  INSERT INTO chat_event_search (chat_event_search, rowid, text) SELECT 'delete', old.id, old.text WHERE old.text IS NOT NULL;
  INSERT INTO chat_event_search (rowid, text) SELECT new.id, new.text WHERE new.text IS NOT NULL;
END;
CREATE TABLE chat_queues (
  chat_id INTEGER PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  messages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(messages) AND json_type(messages) = 'array'),
  stops TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stops) AND json_type(stops) = 'array'),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1))
) STRICT;
`;

/**
 * v2: プロジェクトのメモのフォルダ（memo_folder = 親フォルダの下のフォルダ名。初めてメモを使ったときに決める /
 * memo_path = このプロジェクトだけ別の場所にするときの絶対パス）
 */
const SCHEMA_V2 = `
ALTER TABLE projects ADD COLUMN memo_folder TEXT CHECK (memo_folder <> '');
ALTER TABLE projects ADD COLUMN memo_path TEXT CHECK (memo_path <> '');
`;

/** MIGRATIONS[n] でいまの系統の版 n → n+1 に上げる（変更は末尾に追記し、既存の要素は書き換えない） */
const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2];

/** いまのコードのスキーマの版（いまの系統の何段目か。v1 から） */
export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * PRAGMA user_version は、この数に版を足して持つ（v1 = 201）。2026-11 の作り直しより前（リリース前）の系統は 100 ＋ 版（101〜）で、
 * その DB は引き継がずに消して作り直す（open.ts の discardPrereleaseData）
 */
export const USER_VERSION_BASE = 200;

/** リリース前の系統の user_version（100 ＋ 版） */
const PRERELEASE_BASE = 100;

const pragmaNumber = (db: DatabaseSync, name: "user_version" | "application_id") =>
  (db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name];

/** PRAGMA user_version そのもの（作ったばかりなら 0、いまの系統は USER_VERSION_BASE ＋ 版） */
export function userVersion(db: DatabaseSync): number {
  return pragmaNumber(db, "user_version");
}

/** データベースの系統と版。empty: 作ったばかり（空） / current: いまの系統の v<version> / prerelease: リリース前の系統（消して作り直す） */
export type SchemaState = { kind: "empty" } | { kind: "current"; version: number } | { kind: "prerelease" };

/** 開いたデータベースが何かを調べる（読むだけ）。Kickoff のものでない・このアプリより新しい版なら、データに触らずに例外を投げる */
export function inspectSchema(db: DatabaseSync): SchemaState {
  const applicationId = pragmaNumber(db, "application_id");
  const raw = userVersion(db);
  if (applicationId === APPLICATION_ID) {
    if (raw > USER_VERSION_BASE && raw <= USER_VERSION_BASE + SCHEMA_VERSION) return { kind: "current", version: raw - USER_VERSION_BASE };
    if (raw > PRERELEASE_BASE && raw < USER_VERSION_BASE) return { kind: "prerelease" };
  }
  if (applicationId === 0 && raw === 0) {
    const { objects } = db.prepare("SELECT count(*) AS objects FROM sqlite_master").get() as { objects: number };
    if (objects === 0) return { kind: "empty" };
  }
  throw new Error(
    `Kickoff のデータベースではないか、対応していない版のため開けません（application_id = ${applicationId}、user_version = ${raw}）。データには触れていません`,
  );
}

/** いまの系統の版を上げる。版ごとに 1 つのトランザクションで流し、いまの系統の印と user_version（USER_VERSION_BASE ＋ 版）を付ける */
export function migrate(db: DatabaseSync) {
  const state = inspectSchema(db);
  if (state.kind === "prerelease") throw new Error("リリース前の版のデータベースは、消してから作り直します（discardPrereleaseData）");
  for (let v = state.kind === "current" ? state.version : 0; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + v + 1};`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
