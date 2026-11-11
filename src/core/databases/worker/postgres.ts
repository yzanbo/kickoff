// PostgreSQL の接続（pg。1 つの接続は DB 1 つにつなぐ。流している文は、別の接続から pg_cancel_backend で止める）
import type { EventEmitter } from "node:events";
import pg from "pg";
import Cursor from "pg-cursor";
import type { DbDatabases, DbDefinition, DbForeignKey, DbIndex, DbObject, DbObjectPath, DbQueryResult, DbSort, DbTableDetail, DbValue } from "@shared/types";
import type { DbOutlineTable, DbTarget } from "../protocol.js";
import type { DbDriver } from "./driver.js";
import { APPLICATION_NAME, CONNECT_TIMEOUT_MS, tlsOptions, triggerHead } from "./network.js";
import { pgDefinition, pgRoutineObjects } from "./postgresRoutines.js";
import { quoteIdent, toDbValue } from "./values.js";

/** 補完のために読むテーブルの数の上限 */
const OUTLINE_TABLES = 500;

/** 日付・時刻の型は文字列のまま受け取る（Date にするとこの Mac の時間帯でずれて見える）。date・time・timestamp・timestamptz・interval・timetz */
const RAW_TYPES = new Set([1082, 1083, 1114, 1184, 1186, 1266]);
const TYPES = {
  getTypeParser: (oid: number, format?: "text" | "binary") => (RAW_TYPES.has(oid) ? (v: string) => v : pg.types.getTypeParser(oid, format)),
} as pg.CustomTypesConfig;

/** 型の番号 → 名前（組み込みの型だけ。ほかは null） */
const TYPE_NAMES = new Map(Object.entries(pg.types.builtins).map(([name, oid]) => [oid as number, name.toLowerCase()]));

/** 外部キーの動き（pg_constraint の 1 文字） */
const FK_ACTIONS: Record<string, string> = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };

/** テーブル・ビューとして木に出す relkind（表・分割した表・ビュー・実体化ビュー・外部テーブル） */
const RELKINDS = "('r', 'p', 'v', 'm', 'f')";

type Row = Record<string, unknown>;

/** pg の失敗を、詳しい説明とヒントも付けた文にする */
function pgError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error(String(e));
  const { detail, hint } = e as Error & { detail?: string; hint?: string };
  return new Error([e.message, detail, hint ? `ヒント: ${hint}` : null].filter(Boolean).join("\n"));
}

function clientConfig(target: DbTarget): pg.ClientConfig {
  return {
    host: target.host ?? "localhost",
    port: target.port ?? 5432,
    database: target.database ?? undefined,
    user: target.username ?? undefined,
    password: target.password ?? undefined,
    ssl: tlsOptions(target),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    application_name: APPLICATION_NAME,
    types: TYPES,
  };
}

export async function openPostgres(target: DbTarget): Promise<DbDriver> {
  const config = clientConfig(target);
  const client = new pg.Client(config);
  const driver = new PostgresDriver(client, config);
  try {
    await client.connect();
    if (target.read_only) await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  } catch (e) {
    await client.end().catch(() => {});
    throw pgError(e);
  }
  return driver;
}

class PostgresDriver implements DbDriver {
  /** 最後の文のあとのトランザクションの様子（I = なし / T = 途中 / E = 失敗した途中） */
  private tx = "I";
  private lost = false;
  /** 流している文の失敗のさせ方（接続が切れたら、カーソルは答えを返さないことがあるので、ここで失敗にする） */
  private readonly inflight = new Set<(e: Error) => void>();
  /** 接続が切れたら解ける（切れた接続で ReadyForQuery を待ち続けないため） */
  private readonly whenLost: Promise<void>;
  private markLost!: () => void;

  constructor(
    private readonly client: pg.Client,
    private readonly config: pg.ClientConfig,
  ) {
    const connection = (client as unknown as { connection: EventEmitter }).connection;
    // 文が終わるたびに届く ReadyForQuery の様子を覚える
    connection.on("readyForQuery", (m: { status?: string }) => {
      this.tx = m.status ?? "I";
    });
    // DB が接続を切った（落ちた・止めた）。ワーカーを落とさず、次の頼みでつなぎ直す
    this.whenLost = new Promise((resolve) => (this.markLost = resolve));
    const drop = (e?: Error) => {
      this.lost = true;
      this.markLost();
      const error = pgError(e ?? new Error("DB との接続が切れました"));
      for (const fail of this.inflight) fail(error);
      this.inflight.clear();
    };
    // 下の接続の end を先に受ける（pg は切れたときカーソルに知らせる途中で例外になり、Client の error / end まで届かないことがある）
    connection.on("end", () => drop());
    client.on("error", drop);
    client.on("end", () => drop());
  }

  private async all(sql: string, values: unknown[] = []): Promise<Row[]> {
    try {
      return (await this.client.query(sql, values)).rows as Row[];
    } catch (e) {
      throw pgError(e);
    }
  }

  /** テーブルの oid と情報（スキーマが null ならいまのスキーマ） */
  private async relation(path: DbObjectPath, name: string) {
    const [row] = await this.all(
      `SELECT c.oid, c.relkind, n.nspname, c.reltuples, pg_total_relation_size(c.oid) AS size, obj_description(c.oid, 'pg_class') AS comment
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = COALESCE($1, current_schema()) AND c.relname = $2 AND c.relkind IN ${RELKINDS}`,
      [path.schema, name],
    );
    if (!row) throw new Error(`テーブルが見つかりません: ${name}`);
    return row as { oid: number; relkind: string; nspname: string; reltuples: number; size: string | null; comment: string | null };
  }

  alive() {
    return !this.lost;
  }

  async serverVersion() {
    const [row] = await this.all("SHOW server_version");
    return `PostgreSQL ${String(row?.server_version ?? "").split(" ")[0]}`;
  }

  async databases(): Promise<DbDatabases> {
    const rows = await this.all("SELECT datname, current_database() AS current FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname");
    const current = String(rows[0]?.current ?? this.config.database ?? "");
    return { databases: rows.map((r) => String(r.datname)), current: current || null, has_schemas: true };
  }

  async schemas() {
    return (await this.all("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname")).map((r) => String(r.nspname));
  }

  async objects(path: DbObjectPath): Promise<DbObject[]> {
    const rows = await this.all(
      `SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = COALESCE($1, current_schema()) AND c.relkind IN ${RELKINDS} AND NOT c.relispartition ORDER BY c.relname`,
      [path.schema],
    );
    const relations = rows.map((r): DbObject => ({ kind: r.relkind === "v" || r.relkind === "m" ? "view" : "table", name: String(r.relname) }));
    // テーブル・ビューのあとに関数・列挙型
    return [...relations, ...(await pgRoutineObjects((sql, values) => this.all(sql, values), path.schema))];
  }

  definition(path: DbObjectPath, kind: "function" | "enum", name: string): Promise<DbDefinition> {
    return pgDefinition((sql, values) => this.all(sql, values), path.schema, kind, name);
  }

  async table(path: DbObjectPath, name: string): Promise<DbTableDetail> {
    const rel = await this.relation(path, name);
    const isView = rel.relkind === "v" || rel.relkind === "m";
    const columns = (
      await this.all(
        `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS dflt,
           col_description(a.attrelid, a.attnum) AS comment,
           EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
        [rel.oid],
      )
    ).map((r) => ({
      name: String(r.attname),
      type: String(r.type),
      nullable: Boolean(r.nullable),
      default: r.dflt === null ? null : String(r.dflt),
      primary_key: Boolean(r.pk),
      comment: r.comment === null ? null : String(r.comment),
    }));
    const indexRows = await this.all(
      `SELECT ic.relname, i.indisunique, i.indisprimary, pg_get_indexdef(i.indexrelid) AS def,
         ARRAY(SELECT pg_get_indexdef(i.indexrelid, k, true) FROM generate_series(1, i.indnkeyatts) k) AS cols,
         EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid) AS by_constraint
       FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid WHERE i.indrelid = $1 ORDER BY i.indisprimary DESC, ic.relname`,
      [rel.oid],
    );
    const indexes: DbIndex[] = indexRows.map((r) => ({ name: String(r.relname), columns: (r.cols as string[]) ?? [], unique: Boolean(r.indisunique), primary: Boolean(r.indisprimary) }));
    const fkSelect = (side: "conrelid" | "confrelid") =>
      `SELECT con.conname,
         ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
         ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.o) AS ref_cols,
         fn.nspname AS ref_schema, fc.relname AS ref_table, sn.nspname AS src_schema, sc.relname AS src_table, con.confupdtype, con.confdeltype
       FROM pg_constraint con
         JOIN pg_class fc ON fc.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
         JOIN pg_class sc ON sc.oid = con.conrelid JOIN pg_namespace sn ON sn.oid = sc.relnamespace
       WHERE con.contype = 'f' AND con.${side} = $1 ORDER BY con.conname`;
    const toFk = (r: Row): DbForeignKey => ({
      name: String(r.conname),
      columns: (r.cols as string[]) ?? [],
      ref_schema: String(r.ref_schema),
      ref_table: String(r.ref_table),
      ref_columns: (r.ref_cols as string[]) ?? [],
      on_update: FK_ACTIONS[String(r.confupdtype)] ?? null,
      on_delete: FK_ACTIONS[String(r.confdeltype)] ?? null,
    });
    const foreignKeys = (await this.all(fkSelect("conrelid"), [rel.oid])).map(toFk);
    const referencedBy = (await this.all(fkSelect("confrelid"), [rel.oid])).map((r) => ({ ...toFk(r), schema: String(r.src_schema), table: String(r.src_table) }));
    const triggers = (await this.all("SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = $1 AND NOT tgisinternal ORDER BY tgname", [rel.oid])).map(
      (r) => ({ name: String(r.tgname), ...triggerHead(String(r.def)) }),
    );
    const ddl = await this.ddl(rel, columns, indexRows, triggers.length > 0);
    return {
      kind: isView ? "view" : "table",
      columns,
      indexes,
      foreign_keys: foreignKeys,
      referenced_by: referencedBy,
      triggers,
      ddl,
      estimated_rows: !isView && rel.reltuples >= 0 ? Math.round(rel.reltuples) : null,
      size_bytes: !isView && rel.size !== null ? Number(rel.size) : null,
      comment: rel.comment,
    };
  }

  /** 作る文（PostgreSQL は表の作る文を返さないので、列・制約・インデックス・トリガーから組み立てる。ビューは定義から） */
  private async ddl(
    rel: { oid: number; relkind: string; nspname: string; comment: string | null },
    columns: DbTableDetail["columns"],
    indexRows: Row[],
    hasTriggers: boolean,
  ): Promise<string> {
    const qualified = `${quoteIdent(rel.nspname)}.${quoteIdent((await this.all("SELECT relname FROM pg_class WHERE oid = $1", [rel.oid]))[0]?.relname as string)}`;
    if (rel.relkind === "v" || rel.relkind === "m") {
      const [row] = await this.all("SELECT pg_get_viewdef($1::oid, true) AS def", [rel.oid]);
      return `CREATE ${rel.relkind === "m" ? "MATERIALIZED VIEW" : "VIEW"} ${qualified} AS\n${String(row?.def ?? "").trim()}`;
    }
    const constraints = await this.all(
      "SELECT conname, pg_get_constraintdef(oid, true) AS def FROM pg_constraint WHERE conrelid = $1 AND contype IN ('p', 'u', 'f', 'c', 'x') ORDER BY contype = 'p' DESC, conname",
      [rel.oid],
    );
    const lines = [
      ...columns.map((c) => `  ${quoteIdent(c.name)} ${c.type}${c.default !== null ? ` DEFAULT ${c.default}` : ""}${c.nullable ? "" : " NOT NULL"}`),
      ...constraints.map((c) => `  CONSTRAINT ${quoteIdent(String(c.conname))} ${String(c.def)}`),
    ];
    const parts = [`CREATE TABLE ${qualified} (\n${lines.join(",\n")}\n);`];
    for (const i of indexRows) if (!i.by_constraint) parts.push(`${String(i.def)};`);
    if (hasTriggers) for (const t of await this.all("SELECT pg_get_triggerdef(oid, true) AS def FROM pg_trigger WHERE tgrelid = $1 AND NOT tgisinternal ORDER BY tgname", [rel.oid])) parts.push(`${String(t.def)};`);
    if (rel.comment) parts.push(`COMMENT ON TABLE ${qualified} IS '${rel.comment.replaceAll("'", "''")}';`);
    return parts.join("\n\n");
  }

  async rows(path: DbObjectPath, name: string, sort: DbSort[], offset: number, limit: number): Promise<DbQueryResult> {
    const rel = await this.relation(path, name);
    const order = sort.length > 0 ? ` ORDER BY ${sort.map((s) => `${quoteIdent(s.column)}${s.desc ? " DESC" : ""}`).join(", ")}` : "";
    const started = performance.now();
    try {
      // 1 行多く読んで、続きがあるかを知る
      const result = await this.client.query({
        text: `SELECT * FROM ${quoteIdent(rel.nspname)}.${quoteIdent(name)}${order} LIMIT $1 OFFSET $2`,
        values: [limit + 1, offset],
        rowMode: "array",
      });
      return {
        columns: result.fields.map((f) => ({ name: f.name, type: TYPE_NAMES.get(f.dataTypeID) ?? null })),
        rows: (result.rows as unknown[][]).slice(0, limit).map((r) => r.map(toDbValue)),
        truncated: result.rows.length > limit,
        affected: null,
        duration_ms: performance.now() - started,
        in_transaction: this.inTransaction(),
      };
    } catch (e) {
      throw pgError(e);
    }
  }

  async count(path: DbObjectPath, name: string) {
    const rel = await this.relation(path, name);
    const [row] = await this.all(`SELECT COUNT(*) AS n FROM ${quoteIdent(rel.nspname)}.${quoteIdent(name)}`);
    return Number(row?.n ?? 0);
  }

  async outline(path: DbObjectPath): Promise<DbOutlineTable[]> {
    const rows = await this.all(
      `SELECT c.relname, ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) AS cols
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = COALESCE($1, current_schema()) AND c.relkind IN ${RELKINDS} AND NOT c.relispartition ORDER BY c.relname LIMIT ${OUTLINE_TABLES}`,
      [path.schema],
    );
    return rows.map((r) => ({ name: String(r.relname), columns: (r.cols as string[]) ?? [] }));
  }

  /** 1 つの文を流す（カーソルで max 行 ＋ 1 行だけ読み、続きは読まない） */
  async query(sql: string, maxRows: number): Promise<DbQueryResult> {
    const started = performance.now();
    const cursor = this.client.query(new Cursor(sql, [], { rowMode: "array" }));
    let read: { rows: unknown[][]; result: pg.QueryResult };
    try {
      read = await new Promise((resolve, reject) => {
        this.inflight.add(reject);
        cursor.read(maxRows + 1, (err, rows, result) => {
          this.inflight.delete(reject);
          if (err) reject(err);
          else resolve({ rows: rows as unknown[][], result });
        });
      });
    } catch (e) {
      await this.closeCursor(cursor);
      throw pgError(e);
    }
    // 閉じ終える（ReadyForQuery が届く）と、トランザクションの様子が決まる
    await this.closeCursor(cursor);
    const fields = read.result.fields ?? [];
    const values: DbValue[][] = read.rows.slice(0, maxRows).map((r) => r.map(toDbValue));
    return {
      columns: fields.map((f) => ({ name: f.name, type: TYPE_NAMES.get(f.dataTypeID) ?? null })),
      rows: values,
      truncated: read.rows.length > maxRows,
      affected: fields.length === 0 ? (read.result.rowCount ?? null) : null,
      duration_ms: performance.now() - started,
      in_transaction: this.inTransaction(),
    };
  }

  /** カーソルを閉じる（ReadyForQuery を待つ。接続が切れたら待たない） */
  private closeCursor(cursor: Cursor) {
    return Promise.race([cursor.close().catch(() => {}), this.whenLost]);
  }

  async cancel() {
    const pid = (this.client as unknown as { processID?: number }).processID;
    if (!pid) return;
    const side = new pg.Client({ ...this.config, application_name: `${APPLICATION_NAME} (cancel)` });
    try {
      await side.connect();
      await side.query("SELECT pg_cancel_backend($1)", [pid]);
    } finally {
      await side.end().catch(() => {});
    }
  }

  inTransaction() {
    return this.tx !== "I";
  }

  async commit() {
    if (this.inTransaction()) await this.all("COMMIT");
  }

  async rollback() {
    if (this.inTransaction()) await this.all("ROLLBACK");
  }

  async close() {
    // 切れた接続の end は終わらないことがあるので待たない
    if (this.lost) return void this.client.end().catch(() => {});
    if (this.inTransaction()) await this.all("ROLLBACK").catch(() => {});
    await this.client.end().catch(() => {});
  }
}
