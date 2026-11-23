// DB クライアントの取り決め（受け口は src/features/database/core/routes/databases.ts。この Mac のアプリの中だけで、どれも端末には開かない）。
// workdir: true は ?worktree= を作業場所に解くルート。marks.locked は、保存したパスワードをキーチェーンで開けないと 409 ＋ DB_PASSWORD_LOCKED を返しうるルート
// （画面はパスワードを聞いてやり直す）
import { empty, route, type Contract, type WorkdirQuery } from "@shared/foundation/contract";
import type {
  CopyDbConnectionBody,
  DbConnectedIds,
  DbConnectionPatch,
  DbConnectionTestBody,
  DbConnectionTestResult,
  DbDisconnectResult,
  DbEditsBody,
  DbEditsResult,
  DbEnteredPasswordsBody,
  DbErBody,
  DbErLayoutBody,
  DbFullRow,
  DbFullRowBody,
  DbImportBody,
  DbRowsBody,
  DbSqlAssistBody,
  DbSqlAssistResult,
  DbSqlBody,
  DbSshHostKeyBody,
  NewDbConnectionBody,
} from "./api";
import type {
  DbConnection,
  DbDatabases,
  DbDefinition,
  DbErPositions,
  DbErSchema,
  DbImportCandidate,
  DbObject,
  DbObjectPath,
  DbOutlineTable,
  DbPrepRun,
  DbPrepState,
  DbQueryHistoryEntry,
  DbQueryResult,
  DbRowFilter,
  DbSshHostKey,
  DbTableDetail,
  DockerDbTarget,
} from "./types";

/** キーチェーンで開けなければ 409 を返しうる、作業場所のルート（つなぐルート） */
const connecting = <B = never, R = unknown, Q extends WorkdirQuery = WorkdirQuery>() => route<B, R, Q>({ workdir: true, marks: { locked: true } });
/** ER 図の配置を覚える DB の場所（erPlace のキー） */
type ErLayoutQuery = { scope: string };

const base = "/api/projects/:projectId/db-connections";
const one = `${base}/:connectionId`;
const session = `${one}/sessions/:session`;

export const databaseContract = {
  [`GET ${base}`]: route<never, DbConnection[]>(),
  /** つないでいる接続（DB タブの左の一覧の印。変わったら SSE の db_connection_state） */
  [`GET ${base}/connected`]: route<never, DbConnectedIds>(),
  [`POST ${base}`]: route<NewDbConnectionBody, DbConnection>({ status: 201 }),
  /** ほかのプロジェクトの接続を写す（パスワードは選んだときだけ） */
  [`POST ${base}/copy`]: route<CopyDbConnectionBody, DbConnection>({ status: 201 }),
  /** プロジェクトの中で見つけた接続の案・取り込む */
  [`GET ${base}/import`]: route<never, DbImportCandidate[]>(),
  [`POST ${base}/import`]: route<DbImportBody, DbConnection[]>({ status: 201 }),
  /** 踏み台のサーバーの鍵を見る・受け入れる（見せた指紋と合うときだけ known_hosts に足す） */
  [`POST ${base}/ssh-host-key`]: route<DbSshHostKeyBody, DbSshHostKey>(),
  [`POST ${base}/ssh-host-key/accept`]: empty<DbSshHostKeyBody>(),
  [`GET ${base}/ssh-hosts`]: route<never, string[]>(),
  /** つながるか試す（保存しない。connection_id があれば保存したパスワードを使う） */
  [`POST ${base}/test`]: connecting<DbConnectionTestBody, DbConnectionTestResult>(),
  [`PATCH ${one}`]: route<DbConnectionPatch, DbConnection>(),
  /** キーチェーンで開けなかったときに利用者が入れたパスワード（コアのメモリにだけ持つ） */
  [`POST ${one}/entered-passwords`]: empty<DbEnteredPasswordsBody>(),
  [`DELETE ${one}`]: empty(),
  [`GET ${one}/databases`]: connecting<never, DbDatabases>(),
  [`GET ${one}/schemas`]: connecting<never, string[], WorkdirQuery & { database?: string }>(),
  [`POST ${one}/objects`]: connecting<{ path: DbObjectPath }, DbObject[]>(),
  [`POST ${one}/table`]: connecting<{ path: DbObjectPath; name: string }, DbTableDetail>(),
  [`POST ${one}/definition`]: connecting<{ path: DbObjectPath; kind: "function" | "enum"; name: string }, DbDefinition>(),
  [`POST ${one}/rows`]: connecting<DbRowsBody, DbQueryResult>(),
  /** 接続を切る（コミットしていない SQL のタブがあれば、force でなければ切らずに返す） */
  [`POST ${one}/disconnect`]: route<{ force?: boolean }, DbDisconnectResult>(),
  [`POST ${one}/full-row`]: connecting<DbFullRowBody, DbFullRow>(),
  [`POST ${one}/count`]: connecting<{ path: DbObjectPath; name: string; filter?: DbRowFilter }, { count: number }>(),
  [`POST ${one}/outline`]: connecting<{ path: DbObjectPath }, DbOutlineTable[]>(),
  [`POST ${one}/sql-assist`]: connecting<DbSqlAssistBody, DbSqlAssistResult>(),
  [`POST ${one}/er`]: connecting<DbErBody, DbErSchema>(),
  [`GET ${one}/er-layout`]: route<never, DbErPositions, ErLayoutQuery>(),
  [`PUT ${one}/er-layout`]: empty<DbErLayoutBody>(),
  [`DELETE ${one}/er-layout`]: empty<never, ErLayoutQuery>(),
  [`POST ${one}/sql`]: connecting<DbSqlBody, DbQueryResult>(),
  /** テーブルの行の変更をまとめて保存する（1 つのトランザクション） */
  [`POST ${one}/edits`]: connecting<DbEditsBody, DbEditsResult>(),
  /** つなぐ前の準備: 中身を確かめた・流す（待たずに 202）・様子・止める・記録 */
  [`POST ${one}/prep/confirm`]: route<never, DbConnection>(),
  [`POST ${one}/prepare`]: route<never, { started: boolean }>({ status: 202 }),
  [`GET ${one}/prepare`]: route<never, DbPrepState | null>(),
  [`POST ${one}/prepare/cancel`]: empty(),
  [`GET ${one}/prep-runs`]: route<never, DbPrepRun[]>(),
  [`GET ${one}/history`]: route<never, DbQueryHistoryEntry[], { limit?: number }>(),
  /** SQL のタブの接続（:session はタブのキー） */
  [`POST ${session}/cancel`]: empty(),
  [`GET ${session}`]: route<never, { in_transaction: boolean }>(),
  [`POST ${session}/commit`]: route<never, { in_transaction: boolean }>(),
  [`POST ${session}/rollback`]: route<never, { in_transaction: boolean }>(),
  [`DELETE ${session}`]: empty(),
  /** Docker タブの「DB で開く」の行き先（登録済みの同じ DB の接続か、取り込みの案か、押せない理由） */
  "GET /api/projects/:projectId/docker/db": route<never, DockerDbTarget, { compose: string; service: string }>(),
} as const satisfies Contract;
