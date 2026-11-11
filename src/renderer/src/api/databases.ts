import type {
  CopyDbConnectionBody,
  DbConnection,
  DbConnectionPatch,
  DbConnectionTestBody,
  DbConnectionTestResult,
  DbDatabases,
  DbDefinition,
  DbErPositions,
  DbErSchema,
  DbImportBody,
  DbImportCandidate,
  DbObject,
  DbObjectPath,
  DbQueryHistoryEntry,
  DbQueryResult,
  DbRowFilter,
  DbRowsBody,
  DbSqlBody,
  DbTableDetail,
  NewDbConnectionBody,
} from "@shared/types";
import { request, withQuery } from "./http";

/** 補完に使う、スキーマの中のテーブルと列の名前 */
export interface DbOutlineTable {
  name: string;
  columns: string[];
}

const base = (projectId: number) => `/api/projects/${projectId}/db-connections`;
const one = (projectId: number, id: number) => `${base(projectId)}/${id}`;
/** 作業場所（null・省略なら本体。SQLite のファイルはワークツリーの中の同じパスを開く） */
const at = (url: string, worktree: string | null) => withQuery(url, { worktree });

/**
 * DB クライアント（コアの routes/databases.ts）。この Mac からだけ使える（ほかからは 403）。
 * パスワードは送るだけで、応答には保存したか（has_password）だけが返る
 */
export const databasesApi = {
  dbConnections: (projectId: number) => request<DbConnection[]>("GET", base(projectId)),
  createDbConnection: (projectId: number, body: NewDbConnectionBody) => request<DbConnection>("POST", base(projectId), body),
  updateDbConnection: (projectId: number, id: number, patch: DbConnectionPatch) => request<DbConnection>("PATCH", one(projectId, id), patch),
  deleteDbConnection: (projectId: number, id: number) => request<void>("DELETE", one(projectId, id)),
  reorderDbConnections: (projectId: number, ids: number[]) => request<DbConnection[]>("PUT", `${base(projectId)}/order`, { ids }),
  dbImportCandidates: (projectId: number) => request<DbImportCandidate[]>("GET", `${base(projectId)}/import`),
  importDbConnections: (projectId: number, body: DbImportBody) => request<DbConnection[]>("POST", `${base(projectId)}/import`, body),
  copyDbConnection: (projectId: number, body: CopyDbConnectionBody) => request<DbConnection>("POST", `${base(projectId)}/copy`, body),
  testDbConnection: (projectId: number, body: DbConnectionTestBody, worktree: string | null) =>
    request<DbConnectionTestResult>("POST", at(`${base(projectId)}/test`, worktree), body),
  dbDatabases: (projectId: number, id: number, worktree: string | null) => request<DbDatabases>("GET", at(`${one(projectId, id)}/databases`, worktree)),
  dbSchemas: (projectId: number, id: number, database: string | null, worktree: string | null) =>
    request<string[]>("GET", withQuery(`${one(projectId, id)}/schemas`, { database, worktree })),
  dbObjects: (projectId: number, id: number, path: DbObjectPath, worktree: string | null) => request<DbObject[]>("POST", at(`${one(projectId, id)}/objects`, worktree), { path }),
  dbTable: (projectId: number, id: number, path: DbObjectPath, name: string, worktree: string | null) =>
    request<DbTableDetail>("POST", at(`${one(projectId, id)}/table`, worktree), { path, name }),
  dbDefinition: (projectId: number, id: number, path: DbObjectPath, kind: "function" | "enum", name: string, worktree: string | null) =>
    request<DbDefinition>("POST", at(`${one(projectId, id)}/definition`, worktree), { path, kind, name }),
  dbRows: (projectId: number, id: number, body: DbRowsBody, worktree: string | null) => request<DbQueryResult>("POST", at(`${one(projectId, id)}/rows`, worktree), body),
  dbCount: (projectId: number, id: number, path: DbObjectPath, name: string, filter: DbRowFilter, worktree: string | null) =>
    request<{ count: number }>("POST", at(`${one(projectId, id)}/count`, worktree), { path, name, filter }),
  dbOutline: (projectId: number, id: number, path: DbObjectPath, worktree: string | null) =>
    request<DbOutlineTable[]>("POST", at(`${one(projectId, id)}/outline`, worktree), { path }),
  dbEr: (projectId: number, id: number, path: DbObjectPath, names: string[] | null, worktree: string | null) =>
    request<DbErSchema>("POST", at(`${one(projectId, id)}/er`, worktree), { path, names }),
  dbErLayout: (projectId: number, id: number, place: string) => request<DbErPositions>("GET", withQuery(`${one(projectId, id)}/er-layout`, { place })),
  saveDbErLayout: (projectId: number, id: number, place: string, positions: DbErPositions) => request<void>("PUT", `${one(projectId, id)}/er-layout`, { place, positions }),
  resetDbErLayout: (projectId: number, id: number, place: string) => request<void>("DELETE", withQuery(`${one(projectId, id)}/er-layout`, { place })),
  runDbSql: (projectId: number, id: number, body: DbSqlBody, worktree: string | null) => request<DbQueryResult>("POST", at(`${one(projectId, id)}/sql`, worktree), body),
  dbHistory: (projectId: number, id: number, limit?: number) => request<DbQueryHistoryEntry[]>("GET", withQuery(`${one(projectId, id)}/history`, { limit })),
  cancelDbSql: (projectId: number, id: number, session: string) => request<void>("POST", `${one(projectId, id)}/sessions/${session}/cancel`),
  dbSessionState: (projectId: number, id: number, session: string) => request<{ in_transaction: boolean }>("GET", `${one(projectId, id)}/sessions/${session}`),
  commitDbSession: (projectId: number, id: number, session: string) => request<{ in_transaction: boolean }>("POST", `${one(projectId, id)}/sessions/${session}/commit`),
  rollbackDbSession: (projectId: number, id: number, session: string) => request<{ in_transaction: boolean }>("POST", `${one(projectId, id)}/sessions/${session}/rollback`),
  closeDbSession: (projectId: number, id: number, session: string) => request<void>("DELETE", `${one(projectId, id)}/sessions/${session}`),
};
