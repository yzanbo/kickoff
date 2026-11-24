// どの種類でも同じドライバの部分: 流し方（DbConn）と読み方（DbCatalog）から DbDriver を組む。
// テーブルの行・数・文の結果の形・ER 図の組み立ては、ここに 1 回だけ書く（種類を足すときは DbConn と DbCatalog だけ）
import { filterDialect, filterSql } from "@shared/database/dbFilter";
import { DB_DIALECTS } from "@shared/database/dialect";
import { erTableOf } from "@shared/database/erTable";
import { DB_ER_AUTO_MAX, DB_ER_MAX, type DbEngine, type DbErSchema, type DbObjectPath, type DbQueryResult, type DbSort } from "@shared/database/types";
import type { DbCatalog, DbConn, DbFetched } from "./conn";
import type { DbDriver } from "./driver";
import { toDbValue } from "./values";

/** テーブルが見つからないときの文 */
export const tableNotFound = (name: string) => `テーブルが見つかりません: ${name}`;

/** 並べ替えの ORDER BY（なければ空） */
export const orderBy = (sort: DbSort[], quote: (name: string) => string) => (sort.length > 0 ? ` ORDER BY ${sort.map((s) => `${quote(s.column)}${s.desc ? " DESC" : ""}`).join(", ")}` : "");

/** テーブルの 1 ページを読む文（値の置き場所は絞り込みの used 個のあとに LIMIT・OFFSET の 2 つ） */
export const pageSql = (from: string, where: string, order: string, placeholder: (n: number) => string, used: number) =>
  `SELECT * FROM ${from}${where}${order} LIMIT ${placeholder(used + 1)} OFFSET ${placeholder(used + 2)}`;

/** 読んだものを結果の形にする（limit があれば 1 行多く読んだ分を続きの印にする。full なら長い文字も全体） */
export function queryResult(fetched: DbFetched, opts: { limit?: number; full?: boolean; started: number; inTransaction: boolean }): DbQueryResult {
  const { limit, full = false } = opts;
  const rows = limit === undefined ? fetched.rows : fetched.rows.slice(0, limit);
  return {
    columns: fetched.columns,
    rows: rows.map((r) => r.map((v) => toDbValue(v, full))),
    truncated: fetched.more || (limit !== undefined && fetched.rows.length > limit),
    affected: fetched.affected,
    duration_ms: performance.now() - opts.started,
    in_transaction: opts.inTransaction,
  };
}

/**
 * ER 図の中身: 場所のテーブル・ビューの名前すべてと、描くものの構造（names が null なら DB_ER_AUTO_MAX 以下のときだけすべて。
 * 多すぎれば空で返し、画面が選ばせる。描くのは DB_ER_MAX まで）
 */
export async function erSchema(d: DbDriver, path: DbObjectPath, names: string[] | null): Promise<DbErSchema> {
  const all = (await d.objects(path)).filter((o) => o.kind === "table" || o.kind === "view").map((o) => o.name);
  const known = new Set(all);
  const pick = names ? names.filter((n) => known.has(n)) : all.length <= DB_ER_AUTO_MAX ? all : [];
  const tables = [];
  for (const name of pick.slice(0, DB_ER_MAX)) tables.push(erTableOf(name, await d.table(path, name)));
  return { names: all, tables };
}

/** 流し方と読み方からドライバを組む */
export function driverOf(engine: DbEngine, conn: DbConn, catalog: DbCatalog): DbDriver {
  const { quoteIdent, placeholder } = DB_DIALECTS[engine];
  const dialect = filterDialect(engine);
  return {
    alive: () => conn.alive(),
    serverVersion: () => catalog.serverVersion(conn),
    databases: () => catalog.databases(conn),
    schemas: (database) => catalog.schemas(conn, database),
    objects: (path) => catalog.objects(conn, path),
    table: (path, name) => catalog.table(conn, path, name),
    definition: (path, kind, name) => catalog.definition(conn, path, kind, name),
    outline: (path) => catalog.outline(conn, path),
    async rows(path, name, sort, offset, limit, filter, full = false) {
      const from = await catalog.tableRef(conn, path, name);
      const where = filterSql(filter, dialect);
      const started = performance.now();
      // 1 行多く読んで、続きがあるかを知る
      const fetched = await conn.fetch(pageSql(from, where.clause, orderBy(sort, quoteIdent), placeholder, where.params.length), [...where.params, limit + 1, offset]);
      return queryResult(fetched, { limit, full, started, inTransaction: conn.inTransaction() });
    },
    async count(path, name, filter) {
      const from = await catalog.tableRef(conn, path, name);
      const where = filterSql(filter, dialect);
      const { rows } = await conn.fetch(`SELECT COUNT(*) AS n FROM ${from}${where.clause}`, where.params);
      return Number(rows[0]?.[0] ?? 0);
    },
    async query(sql, maxRows, skip = 0) {
      const started = performance.now();
      const fetched = await conn.fetch(sql, [], { max: maxRows, skip });
      return queryResult(fetched, { started, inTransaction: conn.inTransaction() });
    },
    stream: (sql, onColumns, onRow) => conn.stream(sql, onColumns, onRow),
    execute: (sql, params) => conn.execute(sql, params),
    cancel: () => conn.cancel(),
    inTransaction: () => conn.inTransaction(),
    commit: () => conn.commit(),
    rollback: () => conn.rollback(),
    close: () => conn.close(),
  };
}
