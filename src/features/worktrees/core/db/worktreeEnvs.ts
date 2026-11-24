import type { DatabaseSync } from "node:sqlite";
import type { WorktreeEnv } from "@shared/worktrees/envTypes";
import { NOW } from "@/foundation/core/db/db";
import type { RowOf } from "@/foundation/core/db/table";
import { worktreesTable } from "@/features/worktrees/core/schema";

/** 覚えたワークツリーの実行環境（API の形に、持ち主のプロジェクトと作業するフォルダを足したもの） */
export interface StoredWorktreeEnv extends Omit<WorktreeEnv, "app_url"> {
  path: string;
  project_id: number;
}

const toEnv = (r: RowOf<typeof worktreesTable.columns>): StoredWorktreeEnv => ({
  path: r.path,
  project_id: r.project_id,
  band: r.env_band,
  host: r.env_host,
  slots: r.env_slots,
  compose_names: r.env_compose_names,
  rewritten: r.env_rewritten,
  issues: r.env_issues,
  blocked: r.env_blocked,
});

/** 実行環境のある行（env_created_at を付けた行） */
const HAS_ENV = "env_created_at IS NOT NULL";

/** 実行環境を消した行の env_ の列（帯が空く） */
const NO_ENV = { env_band: null, env_host: null, env_slots: [], env_compose_names: [], env_rewritten: [], env_issues: [], env_blocked: null, env_created_at: null };

/**
 * ワークツリーの実行環境（worktrees の表の env_ の列）。作業するフォルダ（GitWorktree の path）ごとに 1 行（色と同じ行）。
 * 帯は全プロジェクトで重ならない（UNIQUE）。知らせは出さない（作る・消す API の応答で画面に返す）
 */
export function createWorktreeEnvStore(db: DatabaseSync) {
  const rows = worktreesTable.on(db);
  return {
    get(path: string): StoredWorktreeEnv | undefined {
      const row = rows.one(`path = ? AND ${HAS_ENV}`, [path]);
      return row && toEnv(row);
    },
    list: (projectId?: number): StoredWorktreeEnv[] => (projectId === undefined ? rows.list(HAS_ENV) : rows.list(`project_id = ? AND ${HAS_ENV}`, [projectId])).map(toEnv),
    /** ほかのワークツリーに渡してある帯（except の作業するフォルダの分は除く） */
    takenBands: (except?: string): Set<number> => new Set(rows.list("env_band IS NOT NULL AND path IS NOT ?", [except ?? null]).map((r) => r.env_band!)),
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
      const row = rows.get(path);
      if (!row) return;
      if (row.hue === null) rows.remove(path);
      else rows.update(path, NO_ENV);
    },
  };
}
