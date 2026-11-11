import type { DatabaseSync } from "node:sqlite";
import { DB_HISTORY_MAX, type DbQueryHistoryEntry, type DbQueryRanBy } from "@shared/types";

/** 履歴に足す 1 件（id・時刻は表が決める） */
export interface NewDbQueryHistory {
  connection_id: number;
  sql: string;
  ran_by: DbQueryRanBy;
  chat_id?: number | null;
  duration_ms?: number | null;
  row_count?: number | null;
  error?: string | null;
}

/** 履歴に残す SQL の長さの上限（長い文は頭だけ） */
const SQL_MAX = 20_000;

/**
 * DB クライアントの SQL の履歴（db_query_history の表）。接続ごとに新しい DB_HISTORY_MAX 件だけ残し、足すたびに古いものを消す。
 * 知らせは出さない（画面は SQL のタブの履歴を開いたときに読む）
 */
export function createDbQueryHistoryStore(db: DatabaseSync) {
  return {
    add(entry: NewDbQueryHistory): void {
      db.prepare("INSERT INTO db_query_history (connection_id, sql, ran_by, chat_id, duration_ms, row_count, error) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        entry.connection_id,
        entry.sql.slice(0, SQL_MAX),
        entry.ran_by,
        entry.chat_id ?? null,
        entry.duration_ms == null ? null : Math.round(entry.duration_ms),
        entry.row_count ?? null,
        entry.error ?? null,
      );
      db.prepare(
        "DELETE FROM db_query_history WHERE connection_id = ? AND id NOT IN (SELECT id FROM db_query_history WHERE connection_id = ? ORDER BY id DESC LIMIT ?)",
      ).run(entry.connection_id, entry.connection_id, DB_HISTORY_MAX);
    },
    /** 接続の履歴（新しい順） */
    list(connectionId: number, limit = DB_HISTORY_MAX): DbQueryHistoryEntry[] {
      return db.prepare("SELECT * FROM db_query_history WHERE connection_id = ? ORDER BY id DESC LIMIT ?").all(connectionId, limit) as unknown as DbQueryHistoryEntry[];
    },
  };
}
