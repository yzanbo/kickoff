import type { DatabaseSync } from "node:sqlite";

/**
 * ワークツリーの PR の知らせで、確認を閉じた PR（pr_notice_dismissals の表）。同じ PR では確認を出し直さないために覚える。
 * 知らせそのものは DB に持たない（PR の状態はいつも GitHub に聞く。core/git/prWatch.ts）
 */
export function createPrNoticeStore(db: DatabaseSync) {
  return {
    /** そのプロジェクトで確認を閉じた PR の番号 */
    dismissed(projectId: number): Set<number> {
      const rows = db.prepare("SELECT pr_number FROM pr_notice_dismissals WHERE project_id = ?").all(projectId) as { pr_number: number }[];
      return new Set(rows.map((r) => r.pr_number));
    },
    /** 確認を閉じたことを覚える（もう覚えていれば何もしない） */
    dismiss(projectId: number, prNumber: number): void {
      db.prepare("INSERT OR IGNORE INTO pr_notice_dismissals (project_id, pr_number) VALUES (?, ?)").run(projectId, prNumber);
    },
    /** いまの知らせにない PR の覚えを消す（ワークツリーを片付けて、知らせがなくなったもの） */
    keepOnly(projectId: number, prNumbers: number[]): void {
      const keep = prNumbers.filter((n) => Number.isInteger(n));
      db.prepare(`DELETE FROM pr_notice_dismissals WHERE project_id = ?${keep.length ? ` AND pr_number NOT IN (${keep.join(",")})` : ""}`).run(projectId);
    },
  };
}
