// MySQL / MariaDB の流し方（mysql2。1 つの接続で DB を名前で指す。流している文は、別の接続から KILL QUERY で止める）
import mysql, { type Connection, type ConnectionOptions, type FieldPacket, type ResultSetHeader } from "mysql2";
import type { DbEditParam } from "@shared/database/dbEdit";
import { DB_DEFAULT_PORTS } from "@shared/database/types";
import type { DbTarget } from "@shared/database/workerProtocol";
import type { DbConn, DbFetched, DbRow } from "@/features/database/worker/conn";
import type { DbColumns } from "@/features/database/worker/driver";
import { CONNECT_TIMEOUT_MS, tlsOptions, dbTimeoutMs } from "@/features/database/worker/network";
import { mysqlColumns } from "./types";

/** サーバーの様子の印のうち、トランザクションの途中（SERVER_STATUS_IN_TRANS） */
const IN_TRANS = 1;

/** 止めた文の失敗（ER_QUERY_INTERRUPTED。読む上限に届いて止めたときは失敗にしない） */
const QUERY_INTERRUPTED = 1317;

function connectionOptions(target: DbTarget): ConnectionOptions {
  const tls = tlsOptions(target);
  return {
    host: target.host ?? "localhost",
    port: target.port ?? DB_DEFAULT_PORTS.mysql ?? undefined,
    user: target.username ?? undefined,
    password: target.password ?? undefined,
    database: target.database ?? undefined,
    // mysql2 は SslOptions の形（名乗る名前は使わず、トンネルでも CA で確かめる）
    ssl: tls ? (tls as ConnectionOptions["ssl"]) : undefined,
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

export async function openMysql(target: DbTarget): Promise<DbConn> {
  const options = connectionOptions(target);
  const conn = new MysqlConn(await connect(options), options);
  const ms = target.timeout_ms ? dbTimeoutMs(target.timeout_ms) : null;
  // 読み取り専用・時間の上限（MySQL は max_execution_time = ミリ秒・SELECT だけ、MariaDB は max_statement_time = 秒）にできなければ、閉じてから失敗にする（開いたまま残さない）
  try {
    if (target.read_only) await conn.all("SET SESSION TRANSACTION READ ONLY");
    if (ms) await conn.all(`SET SESSION max_execution_time = ${ms}`).catch(() => conn.all(`SET SESSION max_statement_time = ${ms / 1000}`));
  } catch (e) { await conn.close().catch(() => {}); throw e; }
  return conn;
}

class MysqlConn implements DbConn {
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

  /** 行を返さない文の答え（当たった行の数とサーバーの様子） */
  private header(result: unknown): number | null {
    const header = result as ResultSetHeader;
    this.status = header.serverStatus ?? this.status;
    return header.affectedRows ?? null;
  }

  alive() {
    return !this.lost;
  }

  all(sql: string, values: unknown[] = []): Promise<DbRow[]> {
    return new Promise((resolve, reject) => {
      this.conn.query({ sql, values }, (err, result) => {
        if (err) return reject(err);
        if (!Array.isArray(result)) this.header(result);
        resolve(Array.isArray(result) ? (result as DbRow[]) : []);
      });
    });
  }

  /** max がなければ答えをまとめて受ける。あれば行は流れてくるまま受け、max 行を超えたら KILL QUERY で止めて、そこまでを返す */
  fetch(sql: string, params: unknown[], opts: { max?: number; skip?: number } = {}): Promise<DbFetched> {
    const { max, skip = 0 } = opts;
    if (max === undefined) {
      return new Promise((resolve, reject) =>
        this.conn.query({ sql, values: params, rowsAsArray: true }, (err, result, fields) => {
          if (err) return reject(err);
          if (!Array.isArray(result)) return resolve({ columns: [], rows: [], more: false, affected: this.header(result) });
          resolve({ columns: mysqlColumns(fields as FieldPacket[] | undefined), rows: result as unknown[][], more: false, affected: null });
        }),
      );
    }
    return new Promise((resolve, reject) => {
      let columns: DbColumns = [];
      const rows: unknown[][] = [];
      // 「さらに読む」: 頭の skip 行は受けて捨てる
      let skipped = 0;
      let more = false;
      let killing: Promise<void> = Promise.resolve(); // 上限に届いたら KILL QUERY で続きを止める（止め終わってから返す。先に返すと、遅れて届いた KILL が次の文を止める）
      let affected: number | null = null;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        void killing.then(() => resolve({ columns, rows, more, affected }));
      };
      const q = this.conn.query({ sql, rowsAsArray: true });
      // 行を返さない文でも fields は来る（中身は undefined）
      q.on("fields", (fields: FieldPacket[] | undefined) => {
        if (fields && columns.length === 0) columns = mysqlColumns(fields);
      });
      q.on("result", (row: unknown) => {
        if (!Array.isArray(row)) return void (affected = this.header(row));
        if (skipped < skip) skipped++;
        else if (rows.length < max) rows.push(row);
        else if (!more) {
          more = true;
          killing = this.cancel().catch(() => {});
        }
      });
      q.on("error", (err: Error & { errno?: number }) => {
        if (more && err.errno === QUERY_INTERRUPTED) return finish();
        if (settled) return;
        settled = true;
        reject(err);
      });
      q.on("end", finish);
    });
  }

  /** すべての行を流れてくるまま渡す（上限で止めない） */
  stream(sql: string, onColumns: (columns: DbColumns) => void, onRow: (row: unknown[]) => void): Promise<{ affected: number | null }> {
    return new Promise((resolve, reject) => {
      let affected: number | null = null;
      let named = false;
      const q = this.conn.query({ sql, rowsAsArray: true });
      q.on("fields", (fields: FieldPacket[] | undefined) => {
        if (named) return;
        named = true;
        onColumns(mysqlColumns(fields));
      });
      q.on("result", (row: unknown) => {
        if (Array.isArray(row)) return onRow(row);
        affected = this.header(row);
      });
      q.on("error", reject);
      q.on("end", () => {
        if (!named) onColumns([]);
        resolve({ affected });
      });
    });
  }

  /** 値を params で渡して流し、当たった行の数（mysql2 は FOUND_ROWS なので、同じ値への更新も数える） */
  execute(sql: string, params: DbEditParam[]): Promise<number> {
    return new Promise((resolve, reject) => {
      this.conn.query({ sql, values: params }, (err, result) => (err ? reject(err) : resolve(this.header(result) ?? 0)));
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
    await this.all("COMMIT");
  }

  async rollback() {
    await this.all("ROLLBACK");
  }

  async close() {
    // 切れた接続は end の返事が来ないので、そのまま捨てる
    if (this.lost) return this.conn.destroy();
    if (this.inTransaction()) await this.all("ROLLBACK").catch(() => {});
    await new Promise<void>((resolve) => this.conn.end(() => resolve()));
  }
}
