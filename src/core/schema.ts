import type { DatabaseSync } from "node:sqlite";

/** SQLite で今の時刻（ISO 8601・ミリ秒まで）を作る式 */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** 最初（v1）のスキーマ。以降の変更は MIGRATIONS に足していく */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
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
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS tasks (
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
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, phase);
CREATE TABLE IF NOT EXISTS runs (
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
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);
CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id);
CREATE TABLE IF NOT EXISTS artifacts (
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
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
`;

/** MIGRATIONS[n] でバージョン n → n+1 に上げる */
const MIGRATIONS = [
  SCHEMA,
  // v2: 要件定義書の確定（1 段目のゲート）
  "ALTER TABLE projects ADD COLUMN requirements_confirmed_at TEXT",
  // v3: チャット欄で選ぶ推論の深さと権限モード
  `ALTER TABLE runs ADD COLUMN effort TEXT;
   ALTER TABLE runs ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'phase';`,
  // v4: セクションごとの書き込みできるフォルダ（JSON）
  "ALTER TABLE projects ADD COLUMN write_scopes TEXT NOT NULL DEFAULT '{}'",
  // v5: ファストモード
  "ALTER TABLE runs ADD COLUMN fast_mode INTEGER NOT NULL DEFAULT 0",
  // v6: カンバンの列・確認待ち・アーカイブ
  `ALTER TABLE runs ADD COLUMN stage TEXT;
   ALTER TABLE runs ADD COLUMN attention INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE runs ADD COLUMN archived_at TEXT;`,
  // v7: 自分で作るチャットのグループ
  `CREATE TABLE run_groups (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (${NOW}),
     updated_at TEXT NOT NULL DEFAULT (${NOW})
   );
   CREATE INDEX idx_run_groups_project ON run_groups(project_id);
   ALTER TABLE runs ADD COLUMN group_id INTEGER REFERENCES run_groups(id) ON DELETE SET NULL;`,
  // v8: プロジェクトごとの既定（JSON）
  "ALTER TABLE projects ADD COLUMN defaults TEXT NOT NULL DEFAULT '{}'",
  // v9: コンテキストウィンドウの使用量
  `ALTER TABLE runs ADD COLUMN context_tokens INTEGER;
   ALTER TABLE runs ADD COLUMN context_window INTEGER;`,
  // v10: 参照資料（JSON。references は SQL の予約語なので列名を変える）
  "ALTER TABLE projects ADD COLUMN reference_paths TEXT NOT NULL DEFAULT '[]'",
  // v11: サイドバーでのプロジェクトの並び順（最初は作った順）
  `ALTER TABLE projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
   UPDATE projects SET position = id;`,
  // v12: チャットの作業場所（git のワークツリーのフォルダ。空ならプロジェクトのフォルダ＝本体）
  "ALTER TABLE runs ADD COLUMN worktree_path TEXT NOT NULL DEFAULT ''",
  // v13: プロジェクトを上に固定する（ピン留め）・使っていないプロジェクトをしまう（アーカイブ）
  `ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE projects ADD COLUMN archived_at TEXT;`,
  // v14: チャットをサイドバーの上に固定する（ピン留め）
  `ALTER TABLE runs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;`,
  // v15: チャットが作業したブランチ（ワークツリーを片付けた・消したあとも、どのブランチの作業だったか分かるように）
  `ALTER TABLE runs ADD COLUMN branch TEXT NOT NULL DEFAULT '';`,
];

/** スキーマのバージョン管理（PRAGMA user_version）。変更は MIGRATIONS に追記していく */
export function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
