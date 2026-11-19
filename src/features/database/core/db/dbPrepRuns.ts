import type { DatabaseSync } from "node:sqlite";
import type { DbPrepKind, DbPrepRun } from "@shared/types";

/** 接続ごとに残す準備の記録の数 */
const PREP_RUNS_MAX = 200;

/**
 * DB の接続の準備の記録（db_prep_runs の表。いつ・どのコマンド・成功 / 失敗だけで、出力は残さない）。
 * コマンドは登録したまま（{my_ip} などを埋める前）。接続ごとに新しい PREP_RUNS_MAX 件だけ残す。知らせは出さない
 */
export function createDbPrepRunStore(db: DatabaseSync) {
  return {
    add(connectionId: number, kind: DbPrepKind, command: string, ok: boolean): void {
      db.prepare("INSERT INTO db_prep_runs (connection_id, kind, command, ok) VALUES (?, ?, ?, ?)").run(connectionId, kind, command, ok ? 1 : 0);
      db.prepare("DELETE FROM db_prep_runs WHERE connection_id = ? AND id NOT IN (SELECT id FROM db_prep_runs WHERE connection_id = ? ORDER BY id DESC LIMIT ?)").run(
        connectionId,
        connectionId,
        PREP_RUNS_MAX,
      );
    },
    /** 接続の記録（新しい順） */
    list(connectionId: number, limit = 50): DbPrepRun[] {
      const rows = db.prepare("SELECT id, kind, command, ok, ran_at FROM db_prep_runs WHERE connection_id = ? ORDER BY id DESC LIMIT ?").all(connectionId, limit) as unknown as (Omit<
        DbPrepRun,
        "ok"
      > & { ok: number })[];
      return rows.map((r) => ({ ...r, ok: r.ok === 1 }));
    },
  };
}
