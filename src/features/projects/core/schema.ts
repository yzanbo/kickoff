import { NOW } from "@/foundation/core/db/db";

/**
 * プロジェクト（v1）。position は 1 始まり。memo_folder は親フォルダの下のノートのフォルダ名（初めてノートを使ったときに決める）、
 * memo_path はこのプロジェクトだけ別の場所にするときの絶対パス。chat_defaults は Claude Code の既定、provider_chat_defaults はほかの AI の既定
 * （AI ごとの選択の一部）。圧縮前指示・圧縮後指示は設定の共通の指示のあとにつなぐ（オフでも文は残す）。
 * github_account・github_remote は null なら gh で有効なアカウント・自動の remote。trashed_at はゴミ箱に入れた時刻（店の中だけ）
 */
export const PROJECTS_SCHEMA_V1 = `
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),
  description TEXT NOT NULL DEFAULT '',
  repo_path TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  reference_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reference_paths) AND json_type(reference_paths) = 'array'),
  chat_defaults TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(chat_defaults) AND json_type(chat_defaults) = 'object'),
  provider_chat_defaults TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provider_chat_defaults) AND json_type(provider_chat_defaults) = 'object'),
  memo_folder TEXT CHECK (memo_folder <> ''),
  memo_path TEXT CHECK (memo_path <> ''),
  pre_compact_prompt TEXT CHECK (pre_compact_prompt <> ''),
  pre_compact_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pre_compact_enabled IN (0, 1)),
  post_compact_prompt TEXT CHECK (post_compact_prompt <> ''),
  post_compact_enabled INTEGER NOT NULL DEFAULT 1 CHECK (post_compact_enabled IN (0, 1)),
  github_account TEXT CHECK (github_account <> ''),
  github_remote TEXT CHECK (github_remote <> ''),
  pr_watch INTEGER NOT NULL DEFAULT 1 CHECK (pr_watch IN (0, 1)),
  ci_watch INTEGER NOT NULL DEFAULT 1 CHECK (ci_watch IN (0, 1)),
  position INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  archived_at TEXT,
  trashed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
`;
