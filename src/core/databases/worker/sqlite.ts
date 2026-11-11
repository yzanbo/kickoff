// SQLite の接続（node:sqlite。同期で動くので、文を流している間はワーカーが止まる。止めるときはコアがワーカーごと止める）
import fs from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { DbDatabases, DbForeignKey, DbIndex, DbObject, DbObjectPath, DbQueryResult, DbSort, DbTableDetail, DbValue } from "@shared/types";
import type { DbOutlineTable, DbTarget } from "../protocol.js";
import type { DbDriver } from "./driver.js";
import { quoteIdent, toDbValue } from "./values.js";

/** 補完のために読むテーブルの数の上限 */
const OUTLINE_TABLES = 500;

type Rows = Record<string, unknown>[];

export function openSqlite(target: DbTarget): DbDriver {
  const file = target.file;
  if (!file) throw new Error("SQLite のファイルが指定されていません");
  // 書ける形で開くと、ないファイルを新しく作ってしまうので、先に確かめる
  if (!fs.existsSync(file)) throw new Error(`ファイルが見つかりません: ${file}`);
  const db = new DatabaseSync(file, { readOnly: target.read_only, open: true });
  return new SqliteDriver(db);
}

/** 文の結果を読む（列があれば max 行まで、なければ流して変えた行の数） */
function runStatement(db: DatabaseSync, stmt: StatementSync, maxRows: number): DbQueryResult {
  const started = performance.now();
  stmt.setReadBigInts(true);
  const columns = stmt.columns().map((c) => ({ name: c.name, type: c.type ?? null }));
  if (columns.length === 0) {
    const { changes } = stmt.run();
    return { columns, rows: [], truncated: false, affected: Number(changes), duration_ms: performance.now() - started, in_transaction: db.isTransaction };
  }
  stmt.setReturnArrays(true);
  const rows: DbValue[][] = [];
  let truncated = false;
  for (const row of stmt.iterate() as Iterable<unknown[]>) {
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    rows.push(row.map(toDbValue));
  }
  return { columns, rows, truncated, affected: null, duration_ms: performance.now() - started, in_transaction: db.isTransaction };
}

class SqliteDriver implements DbDriver {
  constructor(private readonly db: DatabaseSync) {}

  private all(sql: string, ...params: (string | number)[]): Rows {
    return this.db.prepare(sql).all(...params) as Rows;
  }

  /** テーブルの場所の DB 名（main・temp・付け足した DB） */
  private schemaOf(path: DbObjectPath) {
    return quoteIdent(path.database ?? "main");
  }

  async serverVersion() {
    return `SQLite ${(this.db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v}`;
  }

  async databases(): Promise<DbDatabases> {
    const names = this.all("PRAGMA database_list").map((r) => String(r.name));
    return { databases: names.filter((n) => n !== "temp"), current: "main", has_schemas: false };
  }

  async schemas() {
    return [];
  }

  async objects(path: DbObjectPath): Promise<DbObject[]> {
    return this.all(`SELECT type, name FROM ${this.schemaOf(path)}.sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`).map((r) => ({
      kind: r.type === "view" ? "view" : "table",
      name: String(r.name),
    }));
  }

  async table(path: DbObjectPath, name: string): Promise<DbTableDetail> {
    const schema = this.schemaOf(path);
    const master = this.db.prepare(`SELECT type, sql FROM ${schema}.sqlite_master WHERE name = ? AND type IN ('table', 'view')`).get(name) as { type: string; sql: string | null } | undefined;
    if (!master) throw new Error(`テーブルが見つかりません: ${name}`);
    const columns = this.all(`PRAGMA ${schema}.table_xinfo(${quoteIdent(name)})`)
      .filter((r) => Number(r.hidden) === 0 || Number(r.hidden) > 1)
      .map((r) => ({
        name: String(r.name),
        type: String(r.type ?? ""),
        nullable: Number(r.notnull) === 0 && Number(r.pk) === 0,
        default: r.dflt_value === null ? null : String(r.dflt_value),
        primary_key: Number(r.pk) > 0,
        comment: null,
      }));
    const indexes: DbIndex[] = this.all(`PRAGMA ${schema}.index_list(${quoteIdent(name)})`).map((r) => ({
      name: String(r.name),
      columns: this.all(`PRAGMA ${schema}.index_info(${quoteIdent(String(r.name))})`).map((c) => String(c.name ?? "（式）")),
      unique: Number(r.unique) === 1,
      primary: r.origin === "pk",
    }));
    const foreignKeys = this.foreignKeys(schema, name);
    const referencedBy: DbTableDetail["referenced_by"] = [];
    for (const other of await this.objects(path)) {
      if (other.kind !== "table") continue;
      for (const fk of this.foreignKeys(schema, other.name)) if (fk.ref_table === name) referencedBy.push({ ...fk, schema: path.database ?? "main", table: other.name });
    }
    const triggers = this.all(`SELECT name, sql FROM ${schema}.sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name`, name).map((r) => {
      const head = /\b(BEFORE|AFTER|INSTEAD\s+OF)?\s*(INSERT|UPDATE|DELETE)\b/i.exec(String(r.sql ?? ""));
      return { name: String(r.name), timing: head?.[1]?.toUpperCase() ?? null, event: head?.[2]?.toUpperCase() ?? null };
    });
    const indexSql = this.all(`SELECT sql FROM ${schema}.sqlite_master WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL ORDER BY type, name`, name).map((r) => String(r.sql));
    const ddl = master.sql ? [master.sql, ...indexSql].map((s) => `${s};`).join("\n\n") : null;
    return {
      kind: master.type === "view" ? "view" : "table",
      columns,
      indexes,
      foreign_keys: foreignKeys,
      referenced_by: referencedBy,
      triggers,
      ddl,
      estimated_rows: this.estimatedRows(schema, name),
      size_bytes: null,
      comment: null,
    };
  }

  /** 外部キー（PRAGMA foreign_key_list は列ごとの行なので、id でまとめる） */
  private foreignKeys(schema: string, table: string): DbForeignKey[] {
    const byId = new Map<number, DbForeignKey>();
    for (const r of this.all(`PRAGMA ${schema}.foreign_key_list(${quoteIdent(table)})`)) {
      const id = Number(r.id);
      const fk = byId.get(id) ?? { name: null, columns: [], ref_schema: null, ref_table: String(r.table), ref_columns: [], on_update: String(r.on_update), on_delete: String(r.on_delete) };
      fk.columns.push(String(r.from));
      if (r.to !== null) fk.ref_columns.push(String(r.to));
      byId.set(id, fk);
    }
    return [...byId.values()];
  }

  /** ANALYZE の統計（sqlite_stat1）があれば、その行数 */
  private estimatedRows(schema: string, table: string): number | null {
    try {
      const row = this.db.prepare(`SELECT stat FROM ${schema}.sqlite_stat1 WHERE tbl = ? LIMIT 1`).get(table) as { stat: string } | undefined;
      const n = row ? Number(row.stat.split(" ")[0]) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  async rows(path: DbObjectPath, name: string, sort: DbSort[], offset: number, limit: number): Promise<DbQueryResult> {
    const order = sort.length > 0 ? ` ORDER BY ${sort.map((s) => `${quoteIdent(s.column)}${s.desc ? " DESC" : ""}`).join(", ")}` : "";
    const stmt = this.db.prepare(`SELECT * FROM ${this.schemaOf(path)}.${quoteIdent(name)}${order} LIMIT ? OFFSET ?`);
    stmt.setReadBigInts(true);
    // LIMIT は 1 行多く読んで、続きがあるかを知る
    const columns = stmt.columns().map((c) => ({ name: c.name, type: c.type ?? null }));
    stmt.setReturnArrays(true);
    const started = performance.now();
    const raw = stmt.all(limit + 1, offset) as unknown as unknown[][];
    return {
      columns,
      rows: raw.slice(0, limit).map((r) => r.map(toDbValue)),
      truncated: raw.length > limit,
      affected: null,
      duration_ms: performance.now() - started,
      in_transaction: this.db.isTransaction,
    };
  }

  async count(path: DbObjectPath, name: string) {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.schemaOf(path)}.${quoteIdent(name)}`).get() as { n: number }).n);
  }

  async outline(path: DbObjectPath): Promise<DbOutlineTable[]> {
    const schema = this.schemaOf(path);
    return (await this.objects(path)).slice(0, OUTLINE_TABLES).map((o) => ({
      name: o.name,
      columns: this.all(`PRAGMA ${schema}.table_info(${quoteIdent(o.name)})`).map((r) => String(r.name)),
    }));
  }

  async query(sql: string, maxRows: number) {
    return runStatement(this.db, this.db.prepare(sql), maxRows);
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

/** つながるか試す（開いて版を聞き、閉じる） */
export async function testSqlite(target: DbTarget) {
  const driver = openSqlite({ ...target, read_only: true });
  try {
    return await driver.serverVersion();
  } finally {
    await driver.close();
  }
}
