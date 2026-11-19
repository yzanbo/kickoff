import type { DatabaseSync } from "node:sqlite";

/**
 * ワークツリーの色（worktree_colors の表。v36）。プロジェクトの作業するフォルダ（GitWorktree の path）ごとに、初めて見たときに決めた色相を 1 つ覚える。
 * ブランチを替えても・ほかのワークツリーを足したり消したりしても変えず、同じフォルダに作り直したときも同じ色にするので、ワークツリーを消しても消さない
 * （プロジェクトを消せば一緒に消える）。知らせは出さない（一覧の API の応答で画面に返す）
 */
export function createWorktreeColorStore(db: DatabaseSync) {
  return {
    /** そのプロジェクトで覚えている色（作業するフォルダ → 色相） */
    of(projectId: number): Map<string, number> {
      const rows = db.prepare("SELECT path, hue FROM worktree_colors WHERE project_id = ?").all(projectId) as { path: string; hue: number }[];
      return new Map(rows.map((r) => [r.path, r.hue]));
    },
    /** まだ覚えていなければ覚え、覚えている色を返す（同時に決めても、先に覚えた色にそろう） */
    remember(projectId: number, path: string, hue: number): number {
      db.prepare("INSERT OR IGNORE INTO worktree_colors (project_id, path, hue) VALUES (?, ?, ?)").run(projectId, path, hue);
      return (db.prepare("SELECT hue FROM worktree_colors WHERE project_id = ? AND path = ?").get(projectId, path) as { hue: number }).hue;
    },
  };
}
