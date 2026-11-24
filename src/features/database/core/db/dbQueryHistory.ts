import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { DB_HISTORY_MAX, type DbQueryHistoryEntry, type DbQueryRanBy } from "@shared/database/types";
import { dbQueryHistoryTable } from "@/features/database/core/schema";

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
 * 知らせは出さない（画面は SQL のタブの履歴を開いたときに読む）。チャットの名前は titlesOf（chat の口）で添える
 */
export function createDbQueryHistoryStore(db: DatabaseSync, titlesOf: (ids: readonly number[]) => Map<number, string>) {
  const rows = dbQueryHistoryTable.on(db);
  return {
    add(entry: NewDbQueryHistory): void {
      const { connection_id } = entry;
      rows.insert({ ...entry, sql: entry.sql.slice(0, SQL_MAX), duration_ms: entry.duration_ms == null ? null : Math.round(entry.duration_ms) });
      rows.pruneKeep({ keep: DB_HISTORY_MAX, group: { column: "connection_id", value: connection_id }, order: "id DESC" });
    },
    /** 接続の履歴（新しい順） */
    list(connectionId: number, limit = DB_HISTORY_MAX): DbQueryHistoryEntry[] {
      const found = (db.prepare("SELECT * FROM db_query_history WHERE connection_id = ? ORDER BY id DESC LIMIT ?").all(connectionId, limit) as Record<string, SQLOutputValue>[]).map(rows.fromRow);
      const titles = titlesOf(found.flatMap((h) => (h.chat_id === null ? [] : [h.chat_id])));
      return found.map((h) => ({ ...h, chat_title: h.chat_id === null ? null : (titles.get(h.chat_id) ?? null) }));
    },
  };
}
