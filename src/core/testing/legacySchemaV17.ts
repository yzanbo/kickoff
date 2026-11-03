// 古い系統（application_id なし）の最後の版 v17 のスキーマの写し。古い DB の変換（legacyMigration.ts）のテストからだけ使う。
// 以前の MIGRATIONS（v1〜v17）を順に流した結果と同じ表・列の順・既定・外部キー・索引を、まとめた CREATE TABLE で書いてある
import type { DatabaseSync } from "node:sqlite";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const LEGACY_SCHEMA_V17 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  repo_path TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'claude',
  current_phase TEXT NOT NULL DEFAULT 'requirements',
  test_command TEXT NOT NULL DEFAULT '',
  deploy_instructions TEXT NOT NULL DEFAULT '',
  auto_commit INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  requirements_confirmed_at TEXT,
  write_scopes TEXT NOT NULL DEFAULT '{}',
  defaults TEXT NOT NULL DEFAULT '{}',
  reference_paths TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  hue INTEGER
);
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority INTEGER NOT NULL DEFAULT 2,
  summary TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  worktree_path TEXT NOT NULL DEFAULT '',
  pr_url TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX idx_tasks_project ON tasks(project_id, phase);
CREATE TABLE run_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX idx_run_groups_project ON run_groups(project_id);
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  phase TEXT NOT NULL,
  provider TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  session_id TEXT,
  model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  num_turns INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  effort TEXT,
  permission_mode TEXT NOT NULL DEFAULT 'phase',
  fast_mode INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  attention INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  group_id INTEGER REFERENCES run_groups(id) ON DELETE SET NULL,
  context_tokens INTEGER,
  context_window INTEGER,
  worktree_path TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  branch TEXT NOT NULL DEFAULT '',
  turn_started_at TEXT
);
CREATE INDEX idx_runs_project ON runs(project_id);
CREATE INDEX idx_runs_task ON runs(task_id);
CREATE TABLE run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX idx_run_events_run ON run_events(run_id);
CREATE TABLE artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX idx_artifacts_project ON artifacts(project_id);
`;

/** 空の DB に古い v17 のスキーマを作る（application_id は 0 のまま、user_version = 17） */
export function createLegacyV17(db: DatabaseSync) {
  db.exec(LEGACY_SCHEMA_V17);
  db.exec("PRAGMA user_version = 17");
}
