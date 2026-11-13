import type { DatabaseSync } from "node:sqlite";
import type { WorktreeEnv } from "@shared/types";

/** 覚えたワークツリーの実行環境（API の形に、持ち主のプロジェクトと作業するフォルダを足したもの） */
export interface StoredWorktreeEnv extends Omit<WorktreeEnv, "app_url"> {
  path: string;
  project_id: number;
}

interface Row {
  path: string;
  project_id: number;
  band: number | null;
  host: string | null;
  slots: string;
  compose_names: string;
  rewritten: string;
  issues: string;
  blocked: string | null;
}

const toEnv = (r: Row): StoredWorktreeEnv => ({
  path: r.path,
  project_id: r.project_id,
  band: r.band,
  host: r.host,
  slots: JSON.parse(r.slots) as StoredWorktreeEnv["slots"],
  compose_names: JSON.parse(r.compose_names) as StoredWorktreeEnv["compose_names"],
  rewritten: JSON.parse(r.rewritten) as string[],
  issues: JSON.parse(r.issues) as string[],
  blocked: r.blocked,
});

/**
 * ワークツリーの実行環境（worktree_envs の表。v22）。作業するフォルダ（GitWorktree の path）ごとに 1 行。
 * 帯は全プロジェクトで重ならない（UNIQUE）。知らせは出さない（作る・消す API の応答で画面に返す）
 */
export function createWorktreeEnvStore(db: DatabaseSync) {
  return {
    get(path: string): StoredWorktreeEnv | undefined {
      const row = db.prepare("SELECT * FROM worktree_envs WHERE path = ?").get(path) as Row | undefined;
      return row && toEnv(row);
    },
    list(projectId?: number): StoredWorktreeEnv[] {
      const rows = (projectId === undefined ? db.prepare("SELECT * FROM worktree_envs").all() : db.prepare("SELECT * FROM worktree_envs WHERE project_id = ?").all(projectId)) as unknown as Row[];
      return rows.map(toEnv);
    },
    /** ほかのワークツリーに渡してある帯（except の作業するフォルダの分は除く） */
    takenBands(except?: string): Set<number> {
      const rows = db.prepare("SELECT band FROM worktree_envs WHERE band IS NOT NULL AND path IS NOT ?").all(except ?? null) as { band: number }[];
      return new Set(rows.map((r) => r.band));
    },
    /** 覚える（同じフォルダの前のものは置き換える） */
    put(env: StoredWorktreeEnv): void {
      db.prepare(
        `INSERT INTO worktree_envs (path, project_id, band, host, slots, compose_names, rewritten, issues, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET project_id = excluded.project_id, band = excluded.band, host = excluded.host, slots = excluded.slots,
           compose_names = excluded.compose_names, rewritten = excluded.rewritten, issues = excluded.issues, blocked = excluded.blocked`,
      ).run(env.path, env.project_id, env.band, env.host, JSON.stringify(env.slots), JSON.stringify(env.compose_names), JSON.stringify(env.rewritten), JSON.stringify(env.issues), env.blocked);
    },
    /** 消す（帯が空く） */
    remove(path: string): void {
      db.prepare("DELETE FROM worktree_envs WHERE path = ?").run(path);
    },
  };
}
