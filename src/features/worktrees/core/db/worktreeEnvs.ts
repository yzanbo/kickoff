import type { DatabaseSync } from "node:sqlite";
import type { WorktreeEnv } from "@shared/worktrees/envTypes";
import { NOW } from "@/foundation/core/db/db";

/** 覚えたワークツリーの実行環境（API の形に、持ち主のプロジェクトと作業するフォルダを足したもの） */
export interface StoredWorktreeEnv extends Omit<WorktreeEnv, "app_url"> {
  path: string;
  project_id: number;
}

interface Row {
  path: string;
  project_id: number;
  env_band: number | null;
  env_host: string | null;
  env_slots: string;
  env_compose_names: string;
  env_rewritten: string;
  env_issues: string;
  env_blocked: string | null;
}

const toEnv = (r: Row): StoredWorktreeEnv => ({
  path: r.path,
  project_id: r.project_id,
  band: r.env_band,
  host: r.env_host,
  slots: JSON.parse(r.env_slots) as StoredWorktreeEnv["slots"],
  compose_names: JSON.parse(r.env_compose_names) as StoredWorktreeEnv["compose_names"],
  rewritten: JSON.parse(r.env_rewritten) as string[],
  issues: JSON.parse(r.env_issues) as string[],
  blocked: r.env_blocked,
});

/** 実行環境のある行（env_created_at を付けた行） */
const HAS_ENV = "env_created_at IS NOT NULL";

/**
 * ワークツリーの実行環境（worktrees の表の env_ の列）。作業するフォルダ（GitWorktree の path）ごとに 1 行（色と同じ行）。
 * 帯は全プロジェクトで重ならない（UNIQUE）。知らせは出さない（作る・消す API の応答で画面に返す）
 */
export function createWorktreeEnvStore(db: DatabaseSync) {
  return {
    get(path: string): StoredWorktreeEnv | undefined {
      const row = db.prepare(`SELECT * FROM worktrees WHERE path = ? AND ${HAS_ENV}`).get(path) as Row | undefined;
      return row && toEnv(row);
    },
    list(projectId?: number): StoredWorktreeEnv[] {
      const rows = (projectId === undefined ? db.prepare(`SELECT * FROM worktrees WHERE ${HAS_ENV}`).all() : db.prepare(`SELECT * FROM worktrees WHERE project_id = ? AND ${HAS_ENV}`).all(projectId)) as unknown as Row[];
      return rows.map(toEnv);
    },
    /** ほかのワークツリーに渡してある帯（except の作業するフォルダの分は除く） */
    takenBands(except?: string): Set<number> {
      const rows = db.prepare("SELECT env_band FROM worktrees WHERE env_band IS NOT NULL AND path IS NOT ?").all(except ?? null) as { env_band: number }[];
      return new Set(rows.map((r) => r.env_band));
    },
    /** 覚える（同じフォルダの前のものは置き換える。色は変えない） */
    put(env: StoredWorktreeEnv): void {
      db.prepare(
        `INSERT INTO worktrees (path, project_id, env_band, env_host, env_slots, env_compose_names, env_rewritten, env_issues, env_blocked, env_created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})
         ON CONFLICT(path) DO UPDATE SET project_id = excluded.project_id, env_band = excluded.env_band, env_host = excluded.env_host, env_slots = excluded.env_slots,
           env_compose_names = excluded.env_compose_names, env_rewritten = excluded.env_rewritten, env_issues = excluded.env_issues, env_blocked = excluded.env_blocked,
           env_created_at = COALESCE(worktrees.env_created_at, excluded.env_created_at)`,
      ).run(env.path, env.project_id, env.band, env.host, JSON.stringify(env.slots), JSON.stringify(env.compose_names), JSON.stringify(env.rewritten), JSON.stringify(env.issues), env.blocked);
    },
    /** 消す（帯が空く。色は残し、色もない行は消す） */
    remove(path: string): void {
      db.prepare(
        "UPDATE worktrees SET env_band = NULL, env_host = NULL, env_slots = '[]', env_compose_names = '[]', env_rewritten = '[]', env_issues = '[]', env_blocked = NULL, env_created_at = NULL WHERE path = ?",
      ).run(path);
      db.prepare("DELETE FROM worktrees WHERE path = ? AND hue IS NULL").run(path);
    },
  };
}
