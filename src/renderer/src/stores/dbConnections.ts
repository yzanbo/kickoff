// プロジェクトごとの DB の接続の一覧（DB タブ・右の欄・別ウィンドウの DB クライアントで共通）。変わったら知らせ（db_connections。中身は載らない）で取り直す。
// 接続の一覧はこの Mac からだけ読める（スマホの画面では読まない。active: false）
import type { BusEvent, DbConnection } from "@shared/types";
import { api } from "@/api";
import { createKeyedStore } from "./keyedStore";
import { useKeyedStore } from "./useStore";

export const dbConnectionsStore = createKeyedStore<number, DbConnection[]>({
  load: (projectId) => api.dbConnections(projectId),
  reloadOn: (e, projectId) => e.type === "db_connections" && e.project_id === projectId,
  dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined),
});

/** そのプロジェクトの DB の接続（active が false なら読みに行かない） */
export const useDbConnections = (projectId: number, active = true) => useKeyedStore(dbConnectionsStore, projectId, { active });

/** 知らせ（db_connection_state）で、つないでいる接続の ID の一覧を変える（変わらなければ同じ配列） */
export function reduceConnectedIds(ids: number[], e: BusEvent, projectId: number): number[] {
  if (e.type !== "db_connection_state" || e.project_id !== projectId) return ids;
  const has = ids.includes(e.connection_id);
  if (has === e.connected) return ids;
  return e.connected ? [...ids, e.connection_id] : ids.filter((id) => id !== e.connection_id);
}

/** プロジェクトごとの、つないでいる接続（木・テーブル・SQL のタブの接続が開いているもの）の ID。左の一覧の印 */
const dbConnectedStore = createKeyedStore<number, number[]>({
  load: async (projectId) => (await api.dbConnectedIds(projectId)).ids,
  reduce: reduceConnectedIds,
  dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined),
});

/** そのプロジェクトの、つないでいる接続の ID */
export const useDbConnectedIds = (projectId: number, active = true) => useKeyedStore(dbConnectedStore, projectId, { active });
