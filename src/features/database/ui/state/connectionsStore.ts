// プロジェクトごとの DB の接続の一覧（DB タブ・右の欄・別ウィンドウの DB クライアントで共通）。変わったら知らせ（db_connections。中身は載らない）で取り直す。
// 接続の一覧はこの Mac からだけ読める（スマホの画面では読まない。active: false）
import type { DbConnection } from "@shared/database/types";
import type { ReduceTable } from "@/foundation/ui/store";
import { dbApi } from "@/features/database/ui/api";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";

export const dbConnectionsStore = createKeyedStore<number, DbConnection[]>({
  load: (projectId) => dbApi("GET /api/projects/:projectId/db-connections", { params: { projectId } }),
  reloadOn: { db_connections: (e, projectId) => e.project_id === projectId },
  dropOn: { project_deleted: (e) => e.id },
});

/** そのプロジェクトの DB の接続（active が false なら読みに行かない） */
export const useDbConnections = (projectId: number, active = true) => useKeyedStore(dbConnectionsStore, projectId, { active });

/** 書いた応答の接続をすぐ一覧に入れる（知らせでの取り直しを待たずに画面をそろえる。新しい接続は末尾 = 並び順の position） */
export function applyConnection(c: DbConnection): void {
  dbConnectionsStore.update(c.project_id, (list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));
}

/** 消した接続をすぐ一覧から外す */
export function forgetConnection(projectId: number, id: number): void {
  dbConnectionsStore.update(projectId, (list) => list.filter((x) => x.id !== id));
}

/** 知らせ（db_connection_state）で、つないでいる接続の ID の一覧を変える（変わらなければ同じ配列） */
export const reduceConnectedIds: ReduceTable<number[], number> = {
  db_connection_state: (ids, e, projectId) => {
    if (e.project_id !== projectId) return ids;
    const has = ids.includes(e.connection_id);
    if (has === e.connected) return ids;
    return e.connected ? [...ids, e.connection_id] : ids.filter((id) => id !== e.connection_id);
  },
};

/** プロジェクトごとの、つないでいる接続（木・テーブル・SQL のタブの接続が開いているもの）の ID。左の一覧の印 */
const dbConnectedStore = createKeyedStore<number, number[]>({
  load: async (projectId) => (await dbApi("GET /api/projects/:projectId/db-connections/connected", { params: { projectId } })).ids,
  reduce: reduceConnectedIds,
  dropOn: { project_deleted: (e) => e.id },
});

/** そのプロジェクトの、つないでいる接続の ID */
export const useDbConnectedIds = (projectId: number, active = true) => useKeyedStore(dbConnectedStore, projectId, { active });
