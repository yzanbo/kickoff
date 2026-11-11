// チャットの AI の DB のツール（kickoff_db）の中身。プロバイダーに依らない口で、MCP のツールは providers/claude/dbTools.ts が組み立てる。
// 接続は呼ぶたびに店から引き直す（作業の途中で利用者が許可を変えたら、次の呼び出しから効く）
import { hasConnectCommands } from "@shared/database/dbPrep";
import type { DbConnection, Project } from "@shared/types";
import { Invalid } from "../http/errors.js";
import type { Store } from "../db/store.js";
import { formatAiConnections, formatAiObjects, formatAiQueryResult, formatAiTable } from "./aiFormat.js";
import { assertAiSql, type DatabaseService } from "./service.js";
import { DbPasswordLocked } from "./secrets.js";

/** AI の SQL を流す前に、利用者に聞く（「承認して見せる」の接続だけ）。断られたら理由の文、許されたら null */
export type DbAiApprove = (request: { connection: string; sql: string }) => Promise<string | null>;

export interface DbAiTools {
  /** AI に見せる接続の一覧 */
  connections(): string;
  /** テーブル・ビューなどの一覧 */
  objects(input: { connection?: string; database?: string; schema?: string; search?: string }): Promise<string>;
  /** テーブルの構造 */
  describe(input: { connection?: string; table: string; database?: string; schema?: string }): Promise<string>;
  /** 読み取りの SQL を 1 文だけ流す */
  query(input: { connection?: string; sql: string; database?: string }, approve: DbAiApprove): Promise<string>;
}

/**
 * 保存したパスワードをキーチェーンで開けなかったら、AI には利用者に頼むよう伝える（AI はパスワードを入れられない。
 * DB タブからつなげば、その場でパスワードを聞かれ、入れた値は Kickoff を終えるまで AI のツールでも使う）
 */
async function askUserIfLocked<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof DbPasswordLocked) throw new Invalid(`${e.message}。利用者に DB タブから接続し直してもらってください（DB タブで開くとパスワードを聞かれ、入れたあとはこのツールでも使えます）。`);
    throw e;
  }
}

/** プロジェクトに AI に見せる接続があるか（なければツールを出さない） */
export function hasAiConnections(store: Store, projectId: number): boolean {
  return store.dbConnections.list(projectId).some((c) => c.ai_access !== "none");
}

/**
 * 1 回の実行に渡す DB のツールの中身。workdir はチャットの作業場所（SQLite のファイルをワークツリーの中から開く。null なら本体）
 */
export function createDbAiTools(deps: { store: Store; databases: DatabaseService }, { project, workdir, chatId }: { project: Project; workdir: string | null; chatId: number }): DbAiTools {
  const { store, databases } = deps;
  const visible = () => store.dbConnections.list(project.id).filter((c) => c.ai_access !== "none");

  /** 名前で接続を引く（1 つしかなければ省いてよい。見せない接続は名前を出さずに断る） */
  const resolve = (name: string | undefined): DbConnection => {
    const shown = visible();
    if (!name) {
      if (shown.length === 1) return resolve(shown[0].name);
      throw new Invalid(shown.length === 0 ? "このプロジェクトには、AI に見せる DB の接続がありません。" : "connection に接続の名前を渡してください（db_connections で一覧）。");
    }
    const hit = shown.find((c) => c.name === name) ?? shown.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!hit) throw new Invalid(`「${name}」という AI に見せる接続はありません（db_connections で一覧。利用者が AI に見せないと決めた接続は使えません）。`);
    // つなぐときにコマンド（ポートの転送・パスワードを取る）を流す接続は、AI からはつながない（準備のコマンドは利用者が押したときだけ流す）
    if (hasConnectCommands(hit.prep)) throw new Invalid(`「${hit.name}」はつなぐときにコマンドを流す接続なので、AI からは使えません。利用者に DB クライアントで見てもらってください。`);
    return hit;
  };

  /** DB とスキーマの既定（DB はつないでいるもの、スキーマは PostgreSQL なら public） */
  const placeOf = async (connection: DbConnection, database?: string, schema?: string) => {
    const dbs = await databases.databases(connection, project, workdir);
    const db = database || dbs.current || dbs.databases[0] || null;
    if (database && !dbs.databases.includes(database)) throw new Invalid(`DB「${database}」はありません（${dbs.databases.join(", ")}）`);
    return { dbs, path: { database: db, schema: dbs.has_schemas ? schema || "public" : null } };
  };
  const label = (connection: DbConnection, path: { database: string | null; schema: string | null }) =>
    [connection.name, path.database, path.schema].filter(Boolean).join(" / ");

  return {
    connections: () => formatAiConnections(visible()),

    objects: ({ connection, database, schema, search }) =>
      askUserIfLocked(async () => {
        const c = resolve(connection);
        const { dbs, path } = await placeOf(c, database, schema);
        return formatAiObjects(await databases.objects(c, project, workdir, path), label(c, path), dbs, search);
      }),

    describe: ({ connection, table, database, schema }) =>
      askUserIfLocked(async () => {
        const c = resolve(connection);
        const { path } = await placeOf(c, database, schema);
        return formatAiTable(table, await databases.table(c, project, workdir, path, table));
      }),

    query: ({ connection, sql, database }, approve) =>
      askUserIfLocked(async () => {
        const c = resolve(connection);
        assertAiSql(sql, c.engine);
        if (c.ai_access === "ask") {
          const denied = await approve({ connection: c.name, sql });
          if (denied !== null) throw new Invalid(denied);
        }
        const result = await databases.aiQuery(c, project, workdir, { sql, database: database || null, chatId });
        return formatAiQueryResult(c.name, result);
      }),
  };
}
