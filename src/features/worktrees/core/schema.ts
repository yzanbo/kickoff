import { NOW } from "@/foundation/core/db/db";

/**
 * ワークツリー（v1）。作業するフォルダ（GitWorktree の path）ごとに 1 行で、色と実行環境を持つ。
 * hue は初めて見たときに決めた色相（ブランチを替えても・ワークツリーを消しても変えず、同じフォルダに作り直したときも同じ色。プロジェクトを消せば消える）。
 * env_ の列は実行環境（ポートの帯・帯の中の番号の対応・Kickoff が割り当てた組の名前・知らせ。帯は全プロジェクトで 1 つのワークツリーにだけ渡す）で、
 * env_created_at が NULL なら実行環境なし（実行環境を消す = env_ の列を NULL と '[]' に戻す）
 */
export const WORKTREES_SCHEMA_V1 = `
CREATE TABLE worktrees (
  path TEXT PRIMARY KEY CHECK (path <> ''),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hue INTEGER CHECK (hue IS NULL OR hue BETWEEN 0 AND 359),
  env_band INTEGER UNIQUE CHECK (env_band IS NULL OR env_band > 0),
  env_host TEXT CHECK (env_host <> ''),
  env_slots TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(env_slots) AND json_type(env_slots) = 'array'),
  env_compose_names TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(env_compose_names) AND json_type(env_compose_names) = 'array'),
  env_rewritten TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(env_rewritten) AND json_type(env_rewritten) = 'array'),
  env_issues TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(env_issues) AND json_type(env_issues) = 'array'),
  env_blocked TEXT CHECK (env_blocked <> ''),
  env_created_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_worktrees_project ON worktrees(project_id);
`;
