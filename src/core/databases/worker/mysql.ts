// MySQL / MariaDB の接続（mysql2。1 つの接続で DB を名前で指す。流している文は、別の接続から KILL QUERY で止める）
import mysql, { type Connection, type ConnectionOptions, type FieldPacket, type ResultSetHeader } from "mysql2";
import type { DbDatabases, DbForeignKey, DbIndex, DbObject, DbObjectPath, DbQueryResult, DbSort, DbTableDetail, DbValue } from "@shared/types";
import type { DbOutlineTable, DbTarget } from "../protocol.js";
import type { DbDriver } from "./driver.js";
import { CONNECT_TIMEOUT_MS, tlsOptions } from "./network.js";
import { toDbValue } from "./values.js";

/** 補完のために読むテーブルの数の上限 */
const OUTLINE_TABLES = 500;

/** サーバーの様子の印のうち、トランザクションの途中（SERVER_STATUS_IN_TRANS） */
const IN_TRANS = 1;

/** 止めた文の失敗（ER_QUERY_INTERRUPTED。読む上限に届いて止めたときは失敗にしない） */
const QUERY_INTERRUPTED = 1317;

type Row = Record<string, unknown>;

/** 識別子を `…` で囲む（中の ` は 2 つにする） */
const quoteName = (name: string) => `\`${name.replaceAll("`", "``")}\``;

/** 列の型の名前（mysql2 の型の番号から。VAR_STRING → var_string） */
const typeName = (f: FieldPacket) => {
  const name = (mysql.Types as unknown as Record<number, string | undefined>)[f.columnType ?? f.type ?? -1];
  return name ? name.toLowerCase() : null;
};

function connectionOptions(target: DbTarget): ConnectionOptions {
  const tls = tlsOptions(target);
  return {
    host: target.host ?? "localhost",
    port: target.port ?? 3306,
    user: target.username ?? undefined,
    password: target.password ?? undefined,
    database: target.database ?? undefined,
    ssl: tls || undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // 日時は文字列のまま（Date にするとこの Mac の時間帯でずれて見える）。大きな整数・小数は、数で表せない桁のものだけ文字列で
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
    charset: "utf8mb4",
  };
}

const connect = (options: ConnectionOptions) =>
  new Promise<Connection>((resolve, reject) => {
    const conn = mysql.createConnection(options);
    conn.connect((err) => (err ? (conn.destroy(), reject(err)) : resolve(conn)));
  });

export async function openMysql(target: DbTarget): Promise<DbDriver> {
  const options = connectionOptions(target);
  const driver = new MysqlDriver(await connect(options), options);
  if (target.read_only) await driver.run("SET SESSION TRANSACTION READ ONLY");
  return driver;
}

class MysqlDriver implements DbDriver {
  /** 最後に届いたサーバーの様子（OK の応答のたびに更新する） */
  private status = 0;
  private lost = false;

  constructor(
    private readonly conn: Connection,
    private readonly options: ConnectionOptions,
  ) {
    // DB が接続を切った。ワーカーを落とさず、次の頼みでつなぎ直す
    conn.on("error", () => {
      this.lost = true;
    });
    conn.on("end", () => {
      this.lost = true;
    });
  }

  /** 文を流して行（列名のオブジェクト）を返す */
  run(sql: string, values: unknown[] = []): Promise<Row[]> {
    return new Promise((resolve, reject) => {
      this.conn.query({ sql, values }, (err, result) => {
        if (err) return reject(err);
        if (!Array.isArray(result)) this.status = (result as ResultSetHeader).serverStatus ?? this.status;
        resolve(Array.isArray(result) ? (result as Row[]) : []);
      });
    });
  }

  /** テーブルのある DB（指定がなければ接続のいまの DB） */
  private async databaseOf(path: DbObjectPath): Promise<string> {
    if (path.database) return path.database;
    const [row] = await this.run("SELECT DATABASE() AS db");
    if (!row?.db) throw new Error("DB を選んでください（接続に DB 名がありません）");
    return String(row.db);
  }

  alive() {
    return !this.lost;
  }

  async serverVersion() {
    const [row] = await this.run("SELECT VERSION() AS v");
    const v = String(row?.v ?? "");
    return v.includes("MariaDB") ? `MariaDB ${v.split("-")[0]}` : `MySQL ${v}`;
  }

  async databases(): Promise<DbDatabases> {
    const names = (await this.run("SHOW DATABASES")).map((r) => String(Object.values(r)[0]));
    const [row] = await this.run("SELECT DATABASE() AS db");
    return { databases: names, current: row?.db ? String(row.db) : null, has_schemas: false };
  }

  async schemas() {
    return [];
  }

  async objects(path: DbObjectPath): Promise<DbObject[]> {
    const db = await this.databaseOf(path);
    const rows = await this.run("SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME", [db]);
    return rows.map((r) => ({ kind: String(r.type).includes("VIEW") ? "view" : "table", name: String(r.name) }));
  }

  async table(path: DbObjectPath, name: string): Promise<DbTableDetail> {
    const db = await this.databaseOf(path);
    const [info] = await this.run(
      "SELECT TABLE_TYPE AS type, TABLE_ROWS AS est, DATA_LENGTH + INDEX_LENGTH AS size, TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [db, name],
    );
    if (!info) throw new Error(`テーブルが見つかりません: ${name}`);
    const isView = String(info.type).includes("VIEW");
    const columns = (
      await this.run(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt, COLUMN_KEY AS ckey, COLUMN_COMMENT AS comment
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
        [db, name],
      )
    ).map((r) => ({
      name: String(r.name),
      type: String(r.type),
      nullable: r.nullable === "YES",
      default: r.dflt === null ? null : String(r.dflt),
      primary_key: r.ckey === "PRI",
      comment: r.comment ? String(r.comment) : null,
    }));
    const byIndex = new Map<string, DbIndex>();
    for (const r of await this.run(
      "SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, COALESCE(COLUMN_NAME, '（式）') AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME = 'PRIMARY' DESC, INDEX_NAME, SEQ_IN_INDEX",
      [db, name],
    )) {
      const key = String(r.name);
      const index = byIndex.get(key) ?? { name: key, columns: [], unique: Number(r.non_unique) === 0, primary: key === "PRIMARY" };
      index.columns.push(String(r.col));
      byIndex.set(key, index);
    }
    const fkSelect = (where: string) =>
      `SELECT k.CONSTRAINT_NAME AS name, k.TABLE_SCHEMA AS src_schema, k.TABLE_NAME AS src_table, k.COLUMN_NAME AS col,
         k.REFERENCED_TABLE_SCHEMA AS ref_schema, k.REFERENCED_TABLE_NAME AS ref_table, k.REFERENCED_COLUMN_NAME AS ref_col, r.UPDATE_RULE AS on_update, r.DELETE_RULE AS on_delete
       FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
       WHERE ${where} AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_SCHEMA, k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`;
    /** 列ごとの行を、外部キーごとにまとめる */
    const groupFks = (rows: Row[]) => {
      const byKey = new Map<string, DbForeignKey & { schema: string; table: string }>();
      for (const r of rows) {
        const key = `${String(r.src_schema)}.${String(r.src_table)}.${String(r.name)}`;
        const fk = byKey.get(key) ?? {
          name: String(r.name),
          columns: [],
          ref_schema: String(r.ref_schema),
          ref_table: String(r.ref_table),
          ref_columns: [],
          on_update: r.on_update ? String(r.on_update) : null,
          on_delete: r.on_delete ? String(r.on_delete) : null,
          schema: String(r.src_schema),
          table: String(r.src_table),
        };
        fk.columns.push(String(r.col));
        fk.ref_columns.push(String(r.ref_col));
        byKey.set(key, fk);
      }
      return [...byKey.values()];
    };
    const foreignKeys = groupFks(await this.run(fkSelect("k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ?"), [db, name])).map(({ schema: _s, table: _t, ...fk }) => fk);
    const referencedBy = groupFks(await this.run(fkSelect("k.REFERENCED_TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME = ?"), [db, name]));
    const triggers = (
      await this.run(
        "SELECT TRIGGER_NAME AS name, ACTION_TIMING AS timing, EVENT_MANIPULATION AS event FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA = ? AND EVENT_OBJECT_TABLE = ? ORDER BY TRIGGER_NAME",
        [db, name],
      )
    ).map((r) => ({ name: String(r.name), timing: r.timing ? String(r.timing) : null, event: r.event ? String(r.event) : null }));
    const [create] = await this.run(`SHOW CREATE ${isView ? "VIEW" : "TABLE"} ${quoteName(db)}.${quoteName(name)}`).catch(() => [] as Row[]);
    const ddl = create ? String(create["Create Table"] ?? create["Create View"] ?? "") || null : null;
    return {
      kind: isView ? "view" : "table",
      columns,
      indexes: [...byIndex.values()],
      foreign_keys: foreignKeys,
      referenced_by: referencedBy,
      triggers,
      ddl: ddl ? `${ddl};` : null,
      estimated_rows: !isView && info.est !== null ? Number(info.est) : null,
      size_bytes: !isView && info.size !== null ? Number(info.size) : null,
      comment: !isView && info.comment ? String(info.comment) : null,
    };
  }

  async rows(path: DbObjectPath, name: string, sort: DbSort[], offset: number, limit: number): Promise<DbQueryResult> {
    const db = await this.databaseOf(path);
    const order = sort.length > 0 ? ` ORDER BY ${sort.map((s) => `${quoteName(s.column)}${s.desc ? " DESC" : ""}`).join(", ")}` : "";
    const started = performance.now();
    // 1 行多く読んで、続きがあるかを知る
    const { rows, fields } = await new Promise<{ rows: unknown[][]; fields: FieldPacket[] }>((resolve, reject) =>
      this.conn.query({ sql: `SELECT * FROM ${quoteName(db)}.${quoteName(name)}${order} LIMIT ? OFFSET ?`, values: [limit + 1, offset], rowsAsArray: true }, (err, result, fields) =>
        err ? reject(err) : resolve({ rows: result as unknown[][], fields: fields ?? [] }),
      ),
    );
    return {
      columns: fields.map((f) => ({ name: f.name, type: typeName(f) })),
      rows: rows.slice(0, limit).map((r) => r.map(toDbValue)),
      truncated: rows.length > limit,
      affected: null,
      duration_ms: performance.now() - started,
      in_transaction: this.inTransaction(),
    };
  }

  async count(path: DbObjectPath, name: string) {
    const db = await this.databaseOf(path);
    const [row] = await this.run(`SELECT COUNT(*) AS n FROM ${quoteName(db)}.${quoteName(name)}`);
    return Number(row?.n ?? 0);
  }

  async outline(path: DbObjectPath): Promise<DbOutlineTable[]> {
    const db = await this.databaseOf(path).catch(() => null);
    if (!db) return [];
    const byTable = new Map<string, string[]>();
    for (const r of await this.run("SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION", [db])) {
      const table = String(r.t);
      if (!byTable.has(table) && byTable.size >= OUTLINE_TABLES) break;
      byTable.set(table, [...(byTable.get(table) ?? []), String(r.c)]);
    }
    return [...byTable].map(([name, columns]) => ({ name, columns }));
  }

  /** 1 つの文を流す（行は流れてくるまま受け、max 行を超えたら KILL QUERY で止めて、そこまでを返す） */
  query(sql: string, maxRows: number): Promise<DbQueryResult> {
    const started = performance.now();
    return new Promise((resolve, reject) => {
      let columns: DbQueryResult["columns"] = [];
      const rows: DbValue[][] = [];
      let truncated = false;
      let affected: number | null = null;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve({ columns, rows, truncated, affected, duration_ms: performance.now() - started, in_transaction: this.inTransaction() });
      };
      const q = this.conn.query({ sql, rowsAsArray: true });
      // 行を返さない文でも fields は来る（中身は undefined）
      q.on("fields", (fields: FieldPacket[] | undefined) => {
        if (fields && columns.length === 0) columns = fields.map((f) => ({ name: f.name, type: typeName(f) }));
      });
      q.on("result", (row: unknown) => {
        if (!Array.isArray(row)) {
          const header = row as ResultSetHeader;
          affected = header.affectedRows ?? null;
          this.status = header.serverStatus ?? this.status;
          return;
        }
        if (rows.length < maxRows) {
          rows.push(row.map(toDbValue));
        } else if (!truncated) {
          // 上限に届いた。続きは送らせない
          truncated = true;
          void this.cancel().catch(() => {});
        }
      });
      q.on("error", (err: Error & { errno?: number }) => {
        if (truncated && err.errno === QUERY_INTERRUPTED) return finish();
        if (settled) return;
        settled = true;
        reject(err);
      });
      q.on("end", finish);
    });
  }

  async cancel() {
    const side = await connect({ ...this.options, database: undefined });
    try {
      await new Promise<void>((resolve, reject) => side.query(`KILL QUERY ${Number(this.conn.threadId)}`, (err) => (err ? reject(err) : resolve())));
    } finally {
      side.destroy();
    }
  }

  inTransaction() {
    return (this.status & IN_TRANS) !== 0;
  }

  async commit() {
    await this.run("COMMIT");
  }

  async rollback() {
    await this.run("ROLLBACK");
  }

  async close() {
    // 切れた接続は end の返事が来ないので、そのまま捨てる
    if (this.lost) return this.conn.destroy();
    if (this.inTransaction()) await this.run("ROLLBACK").catch(() => {});
    await new Promise<void>((resolve) => this.conn.end(() => resolve()));
  }
}
