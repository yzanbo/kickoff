// コアと DB ワーカー（別のプロセス）のやり取りの形。コアは頼み（Request）を送り、ワーカーは同じ id の答え（Response）を返す。
// 止めるときは { cancel: id } を送る（SQLite は文を流している間ワーカーが受け取れないので、コアがワーカーごと止める）
import type { DbDatabases, DbDefinition, DbEngine, DbErSchema, DbObject, DbRowFilter, DbObjectPath, DbQueryResult, DbSort, DbSsl, DbTableDetail } from "@shared/types";

/** つなぐ先（コアが接続の登録・秘密の値・作業場所から組み立てて、頼みのたびに渡す。ワーカーは保存しない） */
export interface DbTarget {
  engine: DbEngine;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  password: string | null;
  /** SQLite のファイル（絶対パス） */
  file: string | null;
  ssl: DbSsl | null;
  /** DB 側でも読み取り専用にしてつなぐ（読み取り専用の守りの 2 段目） */
  read_only: boolean;
}

/** 補完に使う、スキーマの中のテーブルと列の名前 */
export interface DbOutlineTable {
  name: string;
  columns: string[];
}

/** 接続を使う頼みの共通の項目（session: ワーカーの中の接続の名前。同じ名前なら同じ接続を使い回す） */
interface Session {
  session: string;
  target: DbTarget;
}

/** 頼みの種類 → 引数と答えの形 */
export interface WorkerMethods {
  /** つながるか試す（使い捨ての接続） */
  test: { params: { target: DbTarget }; result: { server_version: string | null } };
  databases: { params: Session; result: DbDatabases };
  schemas: { params: Session & { database: string | null }; result: string[] };
  objects: { params: Session & { path: DbObjectPath }; result: DbObject[] };
  table: { params: Session & { path: DbObjectPath; name: string }; result: DbTableDetail };
  definition: { params: Session & { path: DbObjectPath; kind: "function" | "enum"; name: string }; result: DbDefinition };
  /** ER 図（names: 描くテーブル・ビュー。null なら DB_ER_AUTO_MAX 以下のときだけすべて） */
  er: { params: Session & { path: DbObjectPath; names: string[] | null }; result: DbErSchema };
  rows: { params: Session & { path: DbObjectPath; name: string; sort: DbSort[]; offset: number; limit: number; filter: DbRowFilter }; result: DbQueryResult };
  count: { params: Session & { path: DbObjectPath; name: string; filter: DbRowFilter }; result: { count: number } };
  outline: { params: Session & { path: DbObjectPath }; result: DbOutlineTable[] };
  query: { params: Session & { sql: string; max_rows: number }; result: DbQueryResult };
  commit: { params: { session: string }; result: { in_transaction: boolean } };
  rollback: { params: { session: string }; result: { in_transaction: boolean } };
  /** 接続を閉じる（途中のトランザクションは取り消す） */
  close: { params: { session: string }; result: { closed: boolean } };
}

export type WorkerMethod = keyof WorkerMethods;

export interface WorkerRequest<M extends WorkerMethod = WorkerMethod> {
  id: number;
  method: M;
  params: WorkerMethods[M]["params"];
}

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export interface WorkerCancel {
  cancel: number;
}
