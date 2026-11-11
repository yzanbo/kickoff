// プロジェクトごとの DB の接続の一覧（DB タブ・右の欄・別ウィンドウの DB クライアントで共通）。変わったら知らせ（db_connections。中身は載らない）で取り直す。
// 接続の一覧はこの Mac からだけ読める（スマホの画面では読まない。active: false）
import type { DbConnection } from "@shared/types";
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
