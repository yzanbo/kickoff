// PostgreSQL の流し方（pg。1 つの接続は DB 1 つにつなぐ。流している文は、別の接続から pg_cancel_backend で止める）
import type { EventEmitter } from "node:events";
import pg from "pg";
import Cursor from "pg-cursor";
import type { DbEditParam } from "@shared/database/dbEdit";
import { DB_DEFAULT_PORTS } from "@shared/database/types";
import type { DbTarget } from "@shared/database/workerProtocol";
import type { DbConn, DbFetched, DbRow } from "@/features/database/worker/conn";
import type { DbColumns } from "@/features/database/worker/driver";
import { APPLICATION_NAME, CONNECT_TIMEOUT_MS, tlsOptions, dbTimeoutMs } from "@/features/database/worker/network";

/** 結果をすべて読むとき（CSV の書き出し・読み飛ばし）に 1 回でカーソルから読む行の数 */
const STREAM_BATCH = 1000;

/** 日付・時刻の型は文字列のまま受け取る（Date にするとこの Mac の時間帯でずれて見える）。date・time・timestamp・timestamptz・interval・timetz */
const RAW_TYPES = new Set([1082, 1083, 1114, 1184, 1186, 1266]);
const TYPES = {
  getTypeParser: (oid: number, format?: "text" | "binary") => (RAW_TYPES.has(oid) ? (v: string) => v : pg.types.getTypeParser(oid, format)),
} as pg.CustomTypesConfig;

/** 型の番号 → 名前（組み込みの型だけ。ほかは null） */
const TYPE_NAMES = new Map(Object.entries(pg.types.builtins).map(([name, oid]) => [oid as number, name.toLowerCase()]));

const columnsOf = (fields: pg.FieldDef[] | undefined): DbColumns => (fields ?? []).map((f) => ({ name: f.name, type: TYPE_NAMES.get(f.dataTypeID) ?? null }));

/** pg の失敗を、詳しい説明とヒントも付けた文にする */
function pgError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error(String(e));
  const { detail, hint } = e as Error & { detail?: string; hint?: string };
  return new Error([e.message, detail, hint ? `ヒント: ${hint}` : null].filter(Boolean).join("\n"));
}

function clientConfig(target: DbTarget): pg.ClientConfig {
  return {
    host: target.host ?? "localhost",
    port: target.port ?? DB_DEFAULT_PORTS.postgres ?? undefined,
    database: target.database ?? undefined,
    user: target.username ?? undefined,
    password: target.password ?? undefined,
    ssl: tlsOptions(target),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    application_name: APPLICATION_NAME,
    types: TYPES,
  };
}

export async function openPostgres(target: DbTarget): Promise<DbConn> {
  const config = clientConfig(target);
  const client = new pg.Client(config);
  const conn = new PostgresConn(client, config);
  try {
    await client.connect();
    if (target.read_only) await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    if (target.timeout_ms) await client.query(`SET statement_timeout = ${dbTimeoutMs(target.timeout_ms)}`);
  } catch (e) {
    await client.end().catch(() => {});
    throw pgError(e);
  }
  return conn;
}

class PostgresConn implements DbConn {
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

  alive() {
    return !this.lost;
  }

  async all(sql: string, values: unknown[] = []): Promise<DbRow[]> {
    try {
      return (await this.client.query(sql, values)).rows as DbRow[];
    } catch (e) {
      throw pgError(e);
    }
  }

  /** max があればカーソルで max 行 ＋ 1 行だけ読み、続きは読まない（頭の skip 行は STREAM_BATCH ずつ読んで捨てる。メモリに持たない） */
  async fetch(sql: string, params: unknown[], opts: { max?: number; skip?: number } = {}): Promise<DbFetched> {
    const { max, skip = 0 } = opts;
    if (max === undefined) {
      try {
        const result = await this.client.query({ text: sql, values: params, rowMode: "array" });
        return { columns: columnsOf(result.fields), rows: result.rows as unknown[][], more: false, affected: result.fields.length === 0 ? (result.rowCount ?? null) : null };
      } catch (e) {
        throw pgError(e);
      }
    }
    const cursor = this.client.query(new Cursor(sql, params, { rowMode: "array" }));
    let read: { rows: unknown[][]; result: pg.QueryResult };
    try {
      let left = skip;
      let ended = false;
      while (left > 0 && !ended) {
        const batch = await this.readCursor(cursor, Math.min(left, STREAM_BATCH));
        left -= batch.rows.length;
        ended = batch.rows.length === 0;
      }
      read = await this.readCursor(cursor, max + 1);
    } catch (e) {
      await this.closeCursor(cursor);
      throw pgError(e);
    }
    // 閉じ終える（ReadyForQuery が届く）と、トランザクションの様子が決まる
    await this.closeCursor(cursor);
    const fields = read.result.fields ?? [];
    return { columns: columnsOf(fields), rows: read.rows.slice(0, max), more: read.rows.length > max, affected: fields.length === 0 ? (read.result.rowCount ?? null) : null };
  }

  /** すべての行を 1000 行ずつカーソルで読んで渡す（メモリに全部を持たない） */
  async stream(sql: string, onColumns: (columns: DbColumns) => void, onRow: (row: unknown[]) => void) {
    const cursor = this.client.query(new Cursor(sql, [], { rowMode: "array" }));
    let affected: number | null = null;
    try {
      let first = true;
      for (;;) {
        const read = await this.readCursor(cursor, STREAM_BATCH);
        if (first) {
          const fields = read.result.fields ?? [];
          onColumns(columnsOf(fields));
          if (fields.length === 0) affected = read.result.rowCount ?? null;
          first = false;
        }
        for (const row of read.rows) onRow(row);
        if (read.rows.length < STREAM_BATCH) break;
      }
    } catch (e) {
      await this.closeCursor(cursor);
      throw pgError(e);
    }
    await this.closeCursor(cursor);
    return { affected };
  }

  async execute(sql: string, params: DbEditParam[]) {
    try {
      return (await this.client.query(sql, params)).rowCount ?? 0;
    } catch (e) {
      throw pgError(e);
    }
  }

  /** カーソルから n 行読む（接続が切れたら失敗にする） */
  private readCursor(cursor: Cursor, n: number) {
    return new Promise<{ rows: unknown[][]; result: pg.QueryResult }>((resolve, reject) => {
      this.inflight.add(reject);
      cursor.read(n, (err, rows, result) => {
        this.inflight.delete(reject);
        if (err) reject(err);
        else resolve({ rows: rows as unknown[][], result });
      });
    });
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
