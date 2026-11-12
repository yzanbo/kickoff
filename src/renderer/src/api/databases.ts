import type {
  CopyDbConnectionBody,
  DbConnection,
  DbConnectionPatch,
  DbConnectionTestBody,
  DbConnectionTestResult,
  DbDatabases,
  DbDefinition,
  DbConnectedIds,
  DbSqlAssistBody,
  DbSqlAssistResult,
  DbDisconnectResult,
  DbEditsBody,
  DbEditsResult,
  DbEnteredPasswordsBody,
  DbErPositions,
  DbErSchema,
  DbFullRow,
  DbFullRowBody,
  DbImportBody,
  DbImportCandidate,
  DbObject,
  DbObjectPath,
  DbPrepRun,
  DbPrepState,
  DbQueryHistoryEntry,
  DbQueryResult,
  DbRowFilter,
  DbRowsBody,
  DbSqlBody,
  DbSsh,
  DbSshHostKey,
  DbTableDetail,
  NewDbConnectionBody,
} from "@shared/types";
import { DB_PASSWORD_LOCKED } from "@shared/types";
import { ApiError, request, withQuery } from "./http";

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
 * 保存したパスワードをキーチェーンで開けなかったときに、利用者にパスワードを聞く口（画面の features/database の
 * DbUnlockHost が置く）。入れてもらえたら true（頼みをやり直す）、やめたら false
 */
type DbUnlock = (projectId: number, connectionId: number) => Promise<boolean>;
let unlock: DbUnlock | null = null;

export function setDbUnlock(fn: DbUnlock | null) {
  unlock = fn;
}

/** つなぐ頼み: 保存したパスワードを開けなければ（409 の db_password_locked）利用者に入れてもらい、やり直す */
async function connecting<T>(projectId: number, connectionId: number | null | undefined, call: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await call();
    } catch (e) {
      const locked = e instanceof ApiError && e.code === DB_PASSWORD_LOCKED;
      if (!locked || !connectionId || !unlock || !(await unlock(projectId, connectionId))) throw e;
    }
  }
}

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
    connecting(projectId, body.connection_id, () => request<DbConnectionTestResult>("POST", at(`${base(projectId)}/test`, worktree), body)),
  /** キーチェーンで開けなかったときに入れたパスワード（Kickoff を終えるまでコアのメモリにだけ持つ） */
  enterDbPasswords: (projectId: number, id: number, body: DbEnteredPasswordsBody) => request<void>("POST", `${one(projectId, id)}/entered-passwords`, body),
  /** 踏み台のサーバーの鍵の指紋（初めてのサーバーを画面で確かめる） */
  dbSshHostKey: (projectId: number, ssh: DbSsh) => request<DbSshHostKey>("POST", `${base(projectId)}/ssh-host-key`, { ssh }),
  /** 見せた指紋のサーバーの鍵を ~/.ssh/known_hosts に足す（読み直して合わなければ 409） */
  acceptDbSshHostKey: (projectId: number, ssh: DbSsh, fingerprints: string[]) =>
    request<void>("POST", `${base(projectId)}/ssh-host-key/accept`, { ssh, fingerprints }),
  /** ~/.ssh/config の Host の一覧（SSH のホストの候補） */
  dbSshHosts: (projectId: number) => request<string[]>("GET", `${base(projectId)}/ssh-hosts`),
  /** いまの準備のコマンドを確かめた（確かめるまで流さない） */
  confirmDbPrep: (projectId: number, id: number) => request<DbConnection>("POST", `${one(projectId, id)}/prep/confirm`),
  /** 準備のコマンドを流し始める（202。様子は dbPrepState で） */
  prepareDb: (projectId: number, id: number) => request<{ started: boolean }>("POST", `${one(projectId, id)}/prepare`),
  /** 準備のいまの様子（DB ワーカーが止まっていれば null） */
  dbPrepState: (projectId: number, id: number) => request<DbPrepState | null>("GET", `${one(projectId, id)}/prepare`),
  cancelDbPrep: (projectId: number, id: number) => request<void>("POST", `${one(projectId, id)}/prepare/cancel`),
  /** 準備のコマンドの記録（いつ・どれ・成否。出力は残さない） */
  dbPrepRuns: (projectId: number, id: number) => request<DbPrepRun[]>("GET", `${one(projectId, id)}/prep-runs`),
  dbDatabases: (projectId: number, id: number, worktree: string | null) =>
    connecting(projectId, id, () => request<DbDatabases>("GET", at(`${one(projectId, id)}/databases`, worktree))),
  dbSchemas: (projectId: number, id: number, database: string | null, worktree: string | null) =>
    connecting(projectId, id, () => request<string[]>("GET", withQuery(`${one(projectId, id)}/schemas`, { database, worktree }))),
  dbObjects: (projectId: number, id: number, path: DbObjectPath, worktree: string | null) =>
    connecting(projectId, id, () => request<DbObject[]>("POST", at(`${one(projectId, id)}/objects`, worktree), { path })),
  dbTable: (projectId: number, id: number, path: DbObjectPath, name: string, worktree: string | null) =>
    connecting(projectId, id, () => request<DbTableDetail>("POST", at(`${one(projectId, id)}/table`, worktree), { path, name })),
  dbDefinition: (projectId: number, id: number, path: DbObjectPath, kind: "function" | "enum", name: string, worktree: string | null) =>
    connecting(projectId, id, () => request<DbDefinition>("POST", at(`${one(projectId, id)}/definition`, worktree), { path, kind, name })),
  dbRows: (projectId: number, id: number, body: DbRowsBody, worktree: string | null) =>
    connecting(projectId, id, () => request<DbQueryResult>("POST", at(`${one(projectId, id)}/rows`, worktree), body)),
  dbConnectedIds: (projectId: number) => request<DbConnectedIds>("GET", `${base(projectId)}/connected`),
  disconnectDb: (projectId: number, id: number, force: boolean) => request<DbDisconnectResult>("POST", `${one(projectId, id)}/disconnect`, { force }),
  dbFullRow: (projectId: number, id: number, body: DbFullRowBody, worktree: string | null) =>
    connecting(projectId, id, () => request<DbFullRow>("POST", at(`${one(projectId, id)}/full-row`, worktree), body)),
  dbCount: (projectId: number, id: number, path: DbObjectPath, name: string, filter: DbRowFilter, worktree: string | null) =>
    connecting(projectId, id, () => request<{ count: number }>("POST", at(`${one(projectId, id)}/count`, worktree), { path, name, filter })),
  saveDbEdits: (projectId: number, id: number, body: DbEditsBody, worktree: string | null) =>
    connecting(projectId, id, () => request<DbEditsResult>("POST", at(`${one(projectId, id)}/edits`, worktree), body)),
  dbSqlAssist: (projectId: number, id: number, body: DbSqlAssistBody, worktree: string | null) =>
    connecting(projectId, id, () => request<DbSqlAssistResult>("POST", at(`${one(projectId, id)}/sql-assist`, worktree), body)),
  dbOutline: (projectId: number, id: number, path: DbObjectPath, worktree: string | null) =>
    connecting(projectId, id, () => request<DbOutlineTable[]>("POST", at(`${one(projectId, id)}/outline`, worktree), { path })),
  dbEr: (projectId: number, id: number, path: DbObjectPath, names: string[] | null, worktree: string | null) =>
    connecting(projectId, id, () => request<DbErSchema>("POST", at(`${one(projectId, id)}/er`, worktree), { path, names })),
  dbErLayout: (projectId: number, id: number, place: string) => request<DbErPositions>("GET", withQuery(`${one(projectId, id)}/er-layout`, { place })),
  saveDbErLayout: (projectId: number, id: number, place: string, positions: DbErPositions) => request<void>("PUT", `${one(projectId, id)}/er-layout`, { place, positions }),
  resetDbErLayout: (projectId: number, id: number, place: string) => request<void>("DELETE", withQuery(`${one(projectId, id)}/er-layout`, { place })),
  runDbSql: (projectId: number, id: number, body: DbSqlBody, worktree: string | null) =>
    connecting(projectId, id, () => request<DbQueryResult>("POST", at(`${one(projectId, id)}/sql`, worktree), body)),
  dbHistory: (projectId: number, id: number, limit?: number) => request<DbQueryHistoryEntry[]>("GET", withQuery(`${one(projectId, id)}/history`, { limit })),
  cancelDbSql: (projectId: number, id: number, session: string) => request<void>("POST", `${one(projectId, id)}/sessions/${session}/cancel`),
  dbSessionState: (projectId: number, id: number, session: string) => request<{ in_transaction: boolean }>("GET", `${one(projectId, id)}/sessions/${session}`),
  commitDbSession: (projectId: number, id: number, session: string) => request<{ in_transaction: boolean }>("POST", `${one(projectId, id)}/sessions/${session}/commit`),
  rollbackDbSession: (projectId: number, id: number, session: string) => request<{ in_transaction: boolean }>("POST", `${one(projectId, id)}/sessions/${session}/rollback`),
  closeDbSession: (projectId: number, id: number, session: string) => request<void>("DELETE", `${one(projectId, id)}/sessions/${session}`),
};
