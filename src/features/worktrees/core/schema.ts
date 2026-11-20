import { NOW } from "@/foundation/core/db/db";

/**
 * ワークツリー（v1）。worktree_envs は作業するフォルダごとの実行環境（ポートの帯・帯の中の番号の対応・Kickoff が割り当てた組の名前・知らせ。
 * 帯は全プロジェクトで 1 つのワークツリーにだけ渡す）。worktree_colors は作業するフォルダごとに初めて見たときに決めた色相（ワークツリーを消しても残す）
 */
export const WORKTREES_SCHEMA_V1 = `
CREATE TABLE worktree_envs (
  path TEXT PRIMARY KEY CHECK (path <> ''),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  band INTEGER UNIQUE CHECK (band IS NULL OR band > 0),
  host TEXT CHECK (host <> ''),
  slots TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(slots) AND json_type(slots) = 'array'),
  compose_names TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(compose_names) AND json_type(compose_names) = 'array'),
  rewritten TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(rewritten) AND json_type(rewritten) = 'array'),
  issues TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues) AND json_type(issues) = 'array'),
  blocked TEXT CHECK (blocked <> ''),
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_worktree_envs_project ON worktree_envs(project_id);
CREATE TABLE worktree_colors (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  hue INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
) STRICT;
`;
