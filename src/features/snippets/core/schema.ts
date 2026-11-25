import { NOW } from "@/foundation/core/db/db";
import { col, table } from "@/foundation/core/db/table";

/**
 * 定型文（v1）。一覧は 1 つで、project_id が NULL ならすべてのプロジェクト（共通のチャットも）、番号ならそのプロジェクトだけ（プロジェクトを消すと一緒に消える）。
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

/** snippets の表の列（行の型は Snippet。並びはすべての定型文で 1 つ・0 始まり。変えるたびに updated_at を進める） */
export const snippetsTable = table(
  "snippets",
  { id: col.int(), project_id: col.int().nullable(), label: col.text().nullable(), text: col.text(), position: col.int(), created_at: col.time(), updated_at: col.time() },
  { order: "position, id", position: { column: "position", base: 0 }, touch: "updated_at" },
);
