import type { DatabaseSync } from "node:sqlite";

/**
 * ワークツリーの色（worktrees の表の hue）。作業するフォルダ（GitWorktree の path）ごとに、初めて見たときに決めた色相を 1 つ覚える。
 * ブランチを替えても・ほかのワークツリーを足したり消したりしても変えず、同じフォルダに作り直したときも同じ色にするので、ワークツリーを消しても消さない
 * （実行環境を消しても行は残す。プロジェクトを消せば一緒に消える）。知らせは出さない（一覧の API の応答で画面に返す）
 */
export function createWorktreeColorStore(db: DatabaseSync) {
  return {
    /** そのプロジェクトで覚えている色（作業するフォルダ → 色相） */
    of(projectId: number): Map<string, number> {
      const rows = db.prepare("SELECT path, hue FROM worktrees WHERE project_id = ? AND hue IS NOT NULL").all(projectId) as { path: string; hue: number }[];
      return new Map(rows.map((r) => [r.path, r.hue]));
    },
    /** まだ覚えていなければ覚え、覚えている色を返す（同時に決めても、先に覚えた色にそろう。実行環境だけの行には色を足す） */
    remember(projectId: number, path: string, hue: number): number {
      db.prepare("INSERT INTO worktrees (path, project_id, hue) VALUES (?, ?, ?) ON CONFLICT (path) DO UPDATE SET hue = COALESCE(worktrees.hue, excluded.hue)").run(path, projectId, hue);
      return (db.prepare("SELECT hue FROM worktrees WHERE path = ?").get(path) as { hue: number }).hue;
    },
  };
}
