import type { DatabaseSync } from "node:sqlite";

/** 覚えておく知らせた実行の数（プロジェクトごと。古いものから消す） */
const KEEP = 500;

/**
 * CI の失敗を知らせた実行（ci_failure_notices の表）。同じ実行を、起動し直すたび・見張るたびに知らせ直さないために覚える。
 * 実行そのものは DB に持たない（いつも GitHub に聞く。core/github/ciWatch.ts）
 */
export function createCiNoticeStore(db: DatabaseSync) {
  return {
    /** そのプロジェクトで知らせた実行の ID */
    notified(projectId: number): Set<number> {
      const rows = db.prepare("SELECT run_id FROM ci_failure_notices WHERE project_id = ?").all(projectId) as { run_id: number }[];
      return new Set(rows.map((r) => r.run_id));
    },
    /** 知らせたことを覚える（もう覚えていれば何もしない。プロジェクトごとに新しい KEEP 件だけ残す） */
    add(projectId: number, runId: number): void {
      db.prepare("INSERT OR IGNORE INTO ci_failure_notices (project_id, run_id) VALUES (?, ?)").run(projectId, runId);
      db.prepare(
        `DELETE FROM ci_failure_notices WHERE project_id = ? AND run_id NOT IN (SELECT run_id FROM ci_failure_notices WHERE project_id = ? ORDER BY run_id DESC LIMIT ${KEEP})`,
      ).run(projectId, projectId);
    },
  };
}
