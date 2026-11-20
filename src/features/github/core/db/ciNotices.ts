import type { DatabaseSync } from "node:sqlite";
import { githubCiNoticesTable } from "@/features/github/core/schema";

/** 覚えておく知らせた実行の数（プロジェクトごと。古いものから消す） */
const KEEP = 500;

/**
 * CI の失敗を知らせた実行（github_ci_notices の表）。同じ実行を、起動し直すたび・見張るたびに知らせ直さないために覚える。
 * 実行そのものは DB に持たない（いつも GitHub に聞く。core/github/ciWatch.ts）
 */
export function createCiNoticeStore(db: DatabaseSync) {
  const rows = githubCiNoticesTable.on(db);
  return {
    /** そのプロジェクトで知らせた実行の ID */
    notified: (projectId: number): Set<number> => new Set(rows.list("project_id = ?", [projectId]).map((r) => r.run_id)),
    /** 知らせたことを覚える（もう覚えていれば何もしない。プロジェクトごとに新しい KEEP 件だけ残す） */
    add(projectId: number, runId: number): void {
      db.prepare("INSERT OR IGNORE INTO github_ci_notices (project_id, run_id) VALUES (?, ?)").run(projectId, runId);
      rows.pruneKeep({ keep: KEEP, group: { column: "project_id", value: projectId }, order: "run_id DESC" });
    },
  };
}
