import type { DatabaseSync } from "node:sqlite";
import type { DbPrepKind, DbPrepRun } from "@shared/database/types";
import { dbPrepRunsTable } from "@/features/database/core/schema";

/** 接続ごとに残す準備の記録の数 */
const PREP_RUNS_MAX = 200;

/**
 * DB の接続の準備の記録（db_prep_runs の表。いつ・どのコマンド・成功 / 失敗だけで、出力は残さない）。
 * コマンドは登録したまま（{my_ip} などを埋める前）。接続ごとに新しい PREP_RUNS_MAX 件だけ残す。知らせは出さない
 */
export function createDbPrepRunStore(db: DatabaseSync) {
  const rows = dbPrepRunsTable.on(db);
  return {
    add(connectionId: number, kind: DbPrepKind, command: string, ok: boolean): void {
      rows.insert({ connection_id: connectionId, kind, command, ok });
      rows.pruneKeep({ keep: PREP_RUNS_MAX, group: { column: "connection_id", value: connectionId }, order: "id DESC" });
    },
    /** 接続の記録（新しい順） */
    list(connectionId: number, limit = 50): DbPrepRun[] {
      return rows.list("connection_id = ?", [connectionId]).slice(0, limit).map(({ connection_id: _c, ...run }) => run);
    },
  };
}
