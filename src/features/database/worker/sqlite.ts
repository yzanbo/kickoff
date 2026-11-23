// SQLite の流し方と読み方（node:sqlite。同期で動くので、文を流している間はワーカーが止まる。止めるときはコアがワーカーごと止める）
import fs from "node:fs";
import { constants as sqliteCodes, DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { DbEditParam } from "@shared/database/dbEdit";
import { DB_DIALECTS } from "@shared/database/dialect";
import { DB_OUTLINE_TABLES, type DbForeignKey, type DbIndex, type DbObject, type DbObjectPath, type DbTableDetail } from "@shared/database/types";
import type { DbTarget } from "@shared/database/workerProtocol";
import { tableNotFound } from "./common";
import type { DbCatalog, DbConn, DbFetched, DbRow } from "./conn";
import type { DbColumns } from "./driver";
import { triggerHead } from "./values";

const { quoteIdent } = DB_DIALECTS.sqlite;

export function openSqlite(target: DbTarget): DbConn {
  const file = target.file;
  if (!file) throw new Error("SQLite のファイルが指定されていません");
  // 書ける形で開くと、ないファイルを新しく作ってしまうので、先に確かめる
  if (!fs.existsSync(file)) throw new Error(`ファイルが見つかりません: ${file}`);
  const db = new DatabaseSync(file, { readOnly: target.read_only, open: true });
  // 読み取り専用（AI の SQL・読み取り専用の接続）では ATTACH / DETACH を DB の側でも断る（ほかの SQLite のファイルを開いて読ませない。
  // 文の判定でも断るが、守りを 2 段にする。PRAGMA query_only は SQL から戻せるので頼らない）
  if (target.read_only) db.setAuthorizer((code) => (code === sqliteCodes.SQLITE_ATTACH || code === sqliteCodes.SQLITE_DETACH ? sqliteCodes.SQLITE_DENY : sqliteCodes.SQLITE_OK));
  return new SqliteConn(db);
}

const inputs = (params: unknown[]) => params as SQLInputValue[];

class SqliteConn implements DbConn {
  constructor(private readonly db: DatabaseSync) {}

  alive() {
    return true;
  }

  async all(sql: string, params: unknown[] = []): Promise<DbRow[]> {
    return this.db.prepare(sql).all(...inputs(params)) as DbRow[];
  }

  /** 列があれば max 行まで（なければすべて）読み、なければ流して変えた行の数 */
  async fetch(sql: string, params: unknown[], opts: { max?: number; skip?: number } = {}): Promise<DbFetched> {
    const { max = Infinity, skip = 0 } = opts;
    const stmt = this.db.prepare(sql);
    stmt.setReadBigInts(true);
    const columns = stmt.columns().map((c) => ({ name: c.name, type: c.type ?? null }));
    if (columns.length === 0) return { columns, rows: [], more: false, affected: Number(stmt.run(...inputs(params)).changes) };
    stmt.setReturnArrays(true);
    const rows: unknown[][] = [];
    let more = false;
    let skipped = 0;
    for (const row of stmt.iterate(...inputs(params)) as Iterable<unknown[]>) {
      if (skipped < skip) {
        skipped++;
        continue;
      }
      if (rows.length >= max) {
        more = true;
        break;
      }
      rows.push(row);
    }
    return { columns, rows, more, affected: null };
  }

  async stream(sql: string, onColumns: (columns: DbColumns) => void, onRow: (row: unknown[]) => void) {
    const stmt = this.db.prepare(sql);
    stmt.setReadBigInts(true);
    const columns = stmt.columns().map((c) => ({ name: c.name, type: c.type ?? null }));
    onColumns(columns);
    if (columns.length === 0) return { affected: Number(stmt.run().changes) };
    stmt.setReturnArrays(true);
    for (const row of stmt.iterate() as Iterable<unknown[]>) onRow(row);
    return { affected: null };
  }

  async execute(sql: string, params: DbEditParam[]) {
    return Number(this.db.prepare(sql).run(...params).changes);
  }

  async cancel() {}

  inTransaction() {
    return this.db.isTransaction;
  }

  async commit() {
    if (this.db.isTransaction) this.db.exec("COMMIT");
  }

  async rollback() {
    if (this.db.isTransaction) this.db.exec("ROLLBACK");
  }

  async close() {
    if (this.db.isTransaction) this.db.exec("ROLLBACK");
    this.db.close();
  }
}

/** テーブルの場所の DB 名（main・temp・付け足した DB） */
const schemaOf = (path: DbObjectPath) => quoteIdent(path.database ?? "main");

/** 外部キー（PRAGMA foreign_key_list は列ごとの行なので、id でまとめる） */
async function foreignKeys(conn: DbConn, schema: string, table: string): Promise<DbForeignKey[]> {
  const byId = new Map<number, DbForeignKey>();
  for (const r of await conn.all(`PRAGMA ${schema}.foreign_key_list(${quoteIdent(table)})`)) {
    const id = Number(r.id);
    const fk = byId.get(id) ?? { name: null, columns: [], ref_schema: null, ref_table: String(r.table), ref_columns: [], on_update: String(r.on_update), on_delete: String(r.on_delete) };
    fk.columns.push(String(r.from));
    if (r.to !== null) fk.ref_columns.push(String(r.to));
    byId.set(id, fk);
  }
  return [...byId.values()];
}

/** ANALYZE の統計（sqlite_stat1）にあるテーブルの行数をまとめて（統計がなければ空） */
async function allEstimatedRows(conn: DbConn, schema: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    for (const r of await conn.all(`SELECT tbl, stat FROM ${schema}.sqlite_stat1`)) {
      const n = Number(String(r.stat).split(" ")[0]);
      if (!out.has(String(r.tbl)) && Number.isFinite(n)) out.set(String(r.tbl), n);
    }
  } catch {
    // sqlite_stat1 がない（ANALYZE をしていない）
  }
  return out;
}

/** ANALYZE の統計（sqlite_stat1）があれば、その行数 */
async function estimatedRows(conn: DbConn, schema: string, table: string): Promise<number | null> {
  try {
    const [row] = await conn.all(`SELECT stat FROM ${schema}.sqlite_stat1 WHERE tbl = ? LIMIT 1`, [table]);
    const n = row ? Number(String(row.stat).split(" ")[0]) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export const sqliteCatalog: DbCatalog = {
  async serverVersion(conn) {
    return `SQLite ${String((await conn.all("SELECT sqlite_version() AS v"))[0]?.v)}`;
  },

  async databases(conn) {
    const names = (await conn.all("PRAGMA database_list")).map((r) => String(r.name));
    return { databases: names.filter((n) => n !== "temp"), current: "main", has_schemas: false };
  },

  async schemas() {
    return [];
  },

  async objects(conn, path): Promise<DbObject[]> {
    const schema = schemaOf(path);
    const stats = await allEstimatedRows(conn, schema);
    return (await conn.all(`SELECT type, name FROM ${schema}.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`)).map((r) => {
      const kind = r.type === "view" ? "view" : "table";
      return { kind, name: String(r.name), estimated_rows: kind === "table" ? (stats.get(String(r.name)) ?? null) : null };
    });
  },

  async definition() {
    throw new Error("SQLite には関数・列挙型がありません");
  },

  async table(conn, path, name): Promise<DbTableDetail> {
    const schema = schemaOf(path);
    const [master] = await conn.all(`SELECT type, sql FROM ${schema}.sqlite_master WHERE name = ? AND type IN ('table', 'view')`, [name]);
    if (!master) throw new Error(tableNotFound(name));
    const columns = (await conn.all(`PRAGMA ${schema}.table_xinfo(${quoteIdent(name)})`))
      .filter((r) => Number(r.hidden) === 0 || Number(r.hidden) > 1)
      .map((r) => ({
        name: String(r.name),
        type: String(r.type ?? ""),
        nullable: Number(r.notnull) === 0 && Number(r.pk) === 0,
        default: r.dflt_value === null ? null : String(r.dflt_value),
        primary_key: Number(r.pk) > 0,
        comment: null,
      }));
    const indexes: DbIndex[] = [];
    for (const r of await conn.all(`PRAGMA ${schema}.index_list(${quoteIdent(name)})`)) {
      const cols = (await conn.all(`PRAGMA ${schema}.index_info(${quoteIdent(String(r.name))})`)).map((c) => String(c.name ?? "（式）"));
      indexes.push({ name: String(r.name), columns: cols, unique: Number(r.unique) === 1, primary: r.origin === "pk" });
    }
    const referencedBy: DbTableDetail["referenced_by"] = [];
    for (const other of await sqliteCatalog.objects(conn, path)) {
      if (other.kind !== "table") continue;
      for (const fk of await foreignKeys(conn, schema, other.name)) if (fk.ref_table === name) referencedBy.push({ ...fk, schema: path.database ?? "main", table: other.name });
    }
    const triggers = (await conn.all(`SELECT name, sql FROM ${schema}.sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name`, [name])).map((r) => ({
      name: String(r.name),
      ...triggerHead(String(r.sql ?? "")),
    }));
    const indexSql = (await conn.all(`SELECT sql FROM ${schema}.sqlite_master WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL ORDER BY type, name`, [name])).map((r) => String(r.sql));
    const ddl = master.sql ? [String(master.sql), ...indexSql].map((s) => `${s};`).join("\n\n") : null;
    return {
      kind: master.type === "view" ? "view" : "table",
      columns,
      indexes,
      foreign_keys: await foreignKeys(conn, schema, name),
      referenced_by: referencedBy,
      triggers,
      ddl,
      estimated_rows: await estimatedRows(conn, schema, name),
      size_bytes: null,
      comment: null,
    };
  },

  async outline(conn, path) {
    const schema = schemaOf(path);
    const tables = (await sqliteCatalog.objects(conn, path)).slice(0, DB_OUTLINE_TABLES);
    const out = [];
    for (const o of tables) out.push({ name: o.name, columns: (await conn.all(`PRAGMA ${schema}.table_info(${quoteIdent(o.name)})`)).map((r) => String(r.name)) });
    return out;
  },

  async tableRef(_conn, path, name) {
    return `${schemaOf(path)}.${quoteIdent(name)}`;
  },
};
