import { NOW } from "@/foundation/core/db/db";

/**
 * 定型文（v1）。一覧は 1 つで、project_id が NULL なら共通（すべてのプロジェクト）、番号ならそのプロジェクトだけ（プロジェクトを消すと一緒に消える）。
 * position はすべての定型文で 1 つの並び（0 始まり）
 */
export const SNIPPETS_SCHEMA_V1 = `
CREATE TABLE snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT CHECK (label <> ''),
  text TEXT NOT NULL CHECK (text <> ''),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_snippets_position ON snippets(position);
`;
