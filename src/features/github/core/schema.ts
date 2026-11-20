import { NOW } from "@/foundation/core/db/db";

/**
 * GitHub（v1）。ci_failure_notices は CI の失敗を知らせた実行（同じ実行を起動のたびに知らせ直さない）、
 * pr_notice_dismissals はワークツリーの PR の知らせで確認を閉じた PR（窓・スマホのどこで閉じてもそろえる。知らせがなくなったら見張りが消す）
 */
export const GITHUB_SCHEMA_V1 = `
CREATE TABLE ci_failure_notices (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL CHECK (run_id > 0),
  notified_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (project_id, run_id)
) STRICT;
CREATE TABLE pr_notice_dismissals (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  dismissed_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (project_id, pr_number)
) STRICT;
`;
