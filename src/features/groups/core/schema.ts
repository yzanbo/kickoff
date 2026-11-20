import { NOW } from "@/foundation/core/db/db";

/** チャットのグループ（v1）。プロジェクトごとの並び（position は 0 始まり） */
export const GROUPS_SCHEMA_V1 = `
CREATE TABLE chat_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_chat_groups_project ON chat_groups(project_id, position);
`;
