// DB の種類ごとの接続（ワーカーの中だけで使う）。テーブルなどの場所 path は種類ごとに読み替える
import type { DbDatabases, DbDefinition, DbObject, DbObjectPath, DbQueryResult, DbRowFilter, DbSort, DbTableDetail } from "@shared/types";
import type { DbEditParam } from "@shared/database/dbEdit";
import type { DbOutlineTable } from "../protocol.js";

export interface DbDriver {
  /** まだつながっているか（DB が接続を切ったら false。次の頼みでつなぎ直す） */
  alive(): boolean;
  serverVersion(): Promise<string | null>;
  databases(): Promise<DbDatabases>;
  schemas(database: string | null): Promise<string[]>;
  objects(path: DbObjectPath): Promise<DbObject[]>;
  table(path: DbObjectPath, name: string): Promise<DbTableDetail>;
  /** 関数・列挙型の定義（ない種類は失敗にする） */
  definition(path: DbObjectPath, kind: "function" | "enum", name: string): Promise<DbDefinition>;
  /** テーブルの行（filter の値は params で渡す。@shared/database/dbFilter の filterSql） */
  rows(path: DbObjectPath, name: string, sort: DbSort[], offset: number, limit: number, filter: DbRowFilter): Promise<DbQueryResult>;
  count(path: DbObjectPath, name: string, filter: DbRowFilter): Promise<number>;
  outline(path: DbObjectPath): Promise<DbOutlineTable[]>;
  /** 1 つの文を流し、max_rows 行まで読む */
  query(sql: string, maxRows: number): Promise<DbQueryResult>;
  /** 値を params で渡して 1 つの文を流し、当たった行の数を返す（セルの編集。BEGIN・COMMIT もこれで流す） */
  execute(sql: string, params: DbEditParam[]): Promise<number>;
  /** 流している文を止める（止められない種類は何もしない） */
  cancel(): Promise<void>;
  inTransaction(): boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}
