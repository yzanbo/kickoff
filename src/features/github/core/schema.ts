import { NOW } from "@/foundation/core/db/db";
import { col, table } from "@/foundation/core/db/table";

/**
 * GitHub（v1）。github_ci_notices は CI の失敗を知らせた実行（同じ実行を起動のたびに知らせ直さない）、
 * worktree_pr_dismissals はワークツリーの PR の知らせで確認を閉じた PR（窓・スマホのどこで閉じてもそろえる。知らせがなくなったら見張りが消す）
 */
export const GITHUB_SCHEMA_V1 = `
CREATE TABLE github_ci_notices (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL CHECK (run_id > 0),
  notified_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (project_id, run_id)
) STRICT;
CREATE TABLE worktree_pr_dismissals (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  dismissed_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (project_id, pr_number)
) STRICT;
`;

/** CI の失敗を知らせた実行（主キーはプロジェクトと実行の 2 列） */
export const githubCiNoticesTable = table("github_ci_notices", { project_id: col.int(), run_id: col.int(), notified_at: col.time() }, { key: "run_id", order: "run_id DESC" });
