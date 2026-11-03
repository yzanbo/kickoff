import type { DatabaseSync } from "node:sqlite";

/** SQLite で今の時刻（ISO 8601・ミリ秒まで）を作る式 */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Kickoff のデータベースの印（PRAGMA application_id。'KICK'）。これがあれば、いまの系統（user_version は 1 から） */
export const APPLICATION_ID = 0x4b49434b;

/**
 * v1 のスキーマ（すべて STRICT。真偽値は 0 / 1、JSON の列は json_valid で確かめる）。
 * 会話の記録のうち、自分の発言と AI の返答（type が user / text）の文は生成列 text に出し、
 * 全文検索の索引 run_event_search（trigram で部分一致）はビュー run_event_texts を中身にして、トリガーで追従させる。
 * 古い系統の v17 からの変換（legacyMigration.ts）も、この版に写す
 */
export const SCHEMA_V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
) STRICT;
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  repo_path TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'claude',
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  position INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  archived_at TEXT,
  defaults TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(defaults)),
  reference_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reference_paths)),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  active_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE TABLE run_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_run_groups_project ON run_groups(project_id);
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES run_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  worktree_path TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  model TEXT,
  effort TEXT,
  permission_mode TEXT NOT NULL,
  fast_mode INTEGER NOT NULL DEFAULT 0 CHECK (fast_mode IN (0, 1)),
  status TEXT NOT NULL,
  session_id TEXT,
  turn_started_at TEXT,
  result TEXT,
  error TEXT,
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  num_turns INTEGER NOT NULL DEFAULT 0,
  context_tokens INTEGER,
  context_window INTEGER,
  attention INTEGER NOT NULL DEFAULT 0 CHECK (attention IN (0, 1)),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  active_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_runs_project ON runs(project_id, archived_at);
CREATE INDEX idx_runs_worktree ON runs(project_id, worktree_path) WHERE worktree_path <> '';
CREATE INDEX idx_runs_group ON runs(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_runs_active ON runs(status) WHERE status IN ('queued', 'running', 'waiting');
CREATE TABLE run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  text TEXT GENERATED ALWAYS AS (CASE WHEN type IN ('user', 'text') THEN json_extract(data, '$.text') END) VIRTUAL
) STRICT;
CREATE INDEX idx_run_events_run ON run_events(run_id);
CREATE VIEW run_event_texts AS SELECT id, text FROM run_events WHERE text IS NOT NULL;
CREATE VIRTUAL TABLE run_event_search USING fts5(text, content = 'run_event_texts', content_rowid = 'id', tokenize = 'trigram');
CREATE TRIGGER run_events_search_insert AFTER INSERT ON run_events WHEN new.text IS NOT NULL BEGIN
  INSERT INTO run_event_search (rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER run_events_search_delete AFTER DELETE ON run_events WHEN old.text IS NOT NULL BEGIN
  INSERT INTO run_event_search (run_event_search, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER run_events_search_update AFTER UPDATE OF type, data ON run_events BEGIN
  INSERT INTO run_event_search (run_event_search, rowid, text) SELECT 'delete', old.id, old.text WHERE old.text IS NOT NULL;
  INSERT INTO run_event_search (rowid, text) SELECT new.id, new.text WHERE new.text IS NOT NULL;
END;
`;

/** MIGRATIONS[n] でバージョン n → n+1 に上げる（いまの系統。変更は末尾に追記し、既存の要素は書き換えない） */
const MIGRATIONS = [SCHEMA_V1];

/** いまのコードのスキーマの版 */
export const SCHEMA_VERSION = MIGRATIONS.length;

/** 古い系統（application_id のない Kickoff）の最後の版。この版のデータベースだけを変換して引き継ぐ（legacyMigration.ts） */
export const LEGACY_VERSION = 17;

const pragmaNumber = (db: DatabaseSync, name: "user_version" | "application_id") =>
  (db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name];

/** データベースのスキーマの版（PRAGMA user_version。作ったばかりなら 0） */
export function schemaVersion(db: DatabaseSync): number {
  return pragmaNumber(db, "user_version");
}

/** データベースの系統と版。empty: 作ったばかり（空） / current: いまの系統 / legacy: 古い系統の v17（変換する） */
export type SchemaState = { kind: "empty" } | { kind: "current"; version: number } | { kind: "legacy" };

/** 開いたデータベースが何かを調べる（読むだけ）。Kickoff のものでない・対応していない版なら、データに触らずに例外を投げる */
export function inspectSchema(db: DatabaseSync): SchemaState {
  const applicationId = pragmaNumber(db, "application_id");
  const version = schemaVersion(db);
  if (applicationId === APPLICATION_ID) return { kind: "current", version };
  if (applicationId === 0) {
    const { objects } = db.prepare("SELECT count(*) AS objects FROM sqlite_master").get() as { objects: number };
    if (version === 0 && objects === 0) return { kind: "empty" };
    if (version === LEGACY_VERSION) return { kind: "legacy" };
  }
  throw new Error(
    `Kickoff のデータベースではないか、対応していない版のため開けません（application_id = ${applicationId}、user_version = ${version}）。データには触れていません`,
  );
}

/** スキーマのバージョン管理（PRAGMA user_version）。版ごとに 1 つのトランザクションで上げ、いまの系統の印を付ける */
export function migrate(db: DatabaseSync) {
  for (let v = schemaVersion(db); v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${v + 1};`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
