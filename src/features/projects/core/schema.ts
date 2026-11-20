import type { Project, ProjectReference } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import { NOW } from "@/foundation/core/db/db";
import { col, table } from "@/foundation/core/db/table";

/**
 * プロジェクト（v1）。position は 1 始まり。note_folder は親フォルダの下のノートのフォルダ名（初めてノートを使ったときに決める）、
 * note_dir はこのプロジェクトだけ別の場所にするときの絶対パス（どちらも仮の置き場所で、notes の表へ移す）。provider_chat_defaults は AI ごとのチャットの既定
 * （AI の ID → 選択の一部。仮の置き場所で、ai の表へ移す）。description のないは NULL。圧縮前指示・圧縮後指示は設定の共通の指示のあとにつなぐ（オフでも文は残す）。
 * github_account・github_remote は null なら gh で有効なアカウント・自動の remote。trashed_at はゴミ箱に入れた時刻（店の中だけ）
 */
export const PROJECTS_SCHEMA_V1 = `
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),
  description TEXT CHECK (description <> ''),
  repo_path TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  reference_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reference_paths) AND json_type(reference_paths) = 'array'),
  provider_chat_defaults TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provider_chat_defaults) AND json_type(provider_chat_defaults) = 'object'),
  note_folder TEXT CHECK (note_folder <> ''),
  note_dir TEXT CHECK (note_dir <> ''),
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

/** projects の表の列（行の型は Project。ゴミ箱に入れたもの = trashed_at がある行は既定で隠す。並びは 1 始まり） */
export const projectsTable = table(
  "projects",
  {
    id: col.int(),
    name: col.text(),
    description: col.text().nullable(),
    repo_path: col.text(),
    provider: col.text<ProviderId>(),
    hue: col.int(),
    tags: col.json<string[]>(),
    reference_paths: col.json<ProjectReference[]>(),
    provider_chat_defaults: col.json<Project["provider_chat_defaults"]>(),
    note_folder: col.text().nullable(),
    note_dir: col.text().nullable(),
    pre_compact_prompt: col.text().nullable(),
    pre_compact_enabled: col.bool(),
    post_compact_prompt: col.text().nullable(),
    post_compact_enabled: col.bool(),
    github_account: col.text().nullable(),
    github_remote: col.text().nullable(),
    pr_watch: col.bool(),
    ci_watch: col.bool(),
    position: col.int(),
    pinned: col.bool(),
    archived_at: col.time().nullable(),
    trashed_at: col.time().nullable().hidden(),
    created_at: col.time(),
  },
  { hide: { column: "trashed_at" }, order: "position, id", position: { column: "position", base: 1 } },
);
