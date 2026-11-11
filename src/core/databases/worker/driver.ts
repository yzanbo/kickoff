// DB の種類ごとの接続（ワーカーの中だけで使う）。テーブルなどの場所 path は種類ごとに読み替える
import type { DbDatabases, DbObject, DbObjectPath, DbQueryResult, DbSort, DbTableDetail } from "@shared/types";
import type { DbOutlineTable } from "../protocol.js";

export interface DbDriver {
  /** まだつながっているか（DB が接続を切ったら false。次の頼みでつなぎ直す） */
  alive(): boolean;
  serverVersion(): Promise<string | null>;
  databases(): Promise<DbDatabases>;
  schemas(database: string | null): Promise<string[]>;
  objects(path: DbObjectPath): Promise<DbObject[]>;
  table(path: DbObjectPath, name: string): Promise<DbTableDetail>;
  rows(path: DbObjectPath, name: string, sort: DbSort[], offset: number, limit: number): Promise<DbQueryResult>;
  count(path: DbObjectPath, name: string): Promise<number>;
  outline(path: DbObjectPath): Promise<DbOutlineTable[]>;
  /** 1 つの文を流し、max_rows 行まで読む */
  query(sql: string, maxRows: number): Promise<DbQueryResult>;
  /** 流している文を止める（止められない種類は何もしない） */
  cancel(): Promise<void>;
  inTransaction(): boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}
