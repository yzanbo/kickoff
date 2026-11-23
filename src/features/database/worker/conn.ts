// ドライバの 2 層の口: 種類ごとに書くのは流し方（DbConn）と読み方（DbCatalog）だけ。DbDriver は common.ts の driverOf が組む
import type { DbEditParam } from "@shared/database/dbEdit";
import type { DbDatabases, DbDefinition, DbObject, DbObjectPath, DbOutlineTable, DbTableDetail } from "@shared/database/types";
import type { DbColumns } from "./driver";

/** 列の名前で読んだ行（カタログの問い合わせ） */
export type DbRow = Record<string, unknown>;

/** 1 つの文を流して読んだもの（値は読んだまま。行を返さない文は affected だけ） */
export interface DbFetched {
  columns: DbColumns;
  rows: unknown[][];
  /** max で止めたあとにも行があった */
  more: boolean;
  /** 行を返さない文の当たった行の数（行を返す文は null） */
  affected: number | null;
}

/** 流し方（ドライバが書く低い層。1 本の接続） */
export interface DbConn {
  /** まだつながっているか（DB が接続を切ったら false。次の頼みでつなぎ直す） */
  alive(): boolean;
  /** 文を流して、行を列の名前で返す（カタログの問い合わせ。値は params） */
  all(sql: string, params?: unknown[]): Promise<DbRow[]>;
  /** 1 つの文を流す（max があれば頭の skip 行を飛ばして max 行まで読み、続きは読まない。なければすべて） */
  fetch(sql: string, params: unknown[], opts?: { max?: number; skip?: number }): Promise<DbFetched>;
  /** すべての行を読んだままの値で 1 行ずつ渡す（列は行より先に渡す。行を返さない文は当たった行の数） */
  stream(sql: string, onColumns: (columns: DbColumns) => void, onRow: (row: unknown[]) => void): Promise<{ affected: number | null }>;
  /** 値を params で渡して流し、当たった行の数を返す（セルの編集。BEGIN・COMMIT もこれで流す） */
  execute(sql: string, params: DbEditParam[]): Promise<number>;
  /** 流している文を止める（止められない種類は何もしない） */
  cancel(): Promise<void>;
  inTransaction(): boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

/** 種類ごとの読み方（カタログ） */
export interface DbCatalog {
  serverVersion(conn: DbConn): Promise<string>;
  databases(conn: DbConn): Promise<DbDatabases>;
  schemas(conn: DbConn, database: string | null): Promise<string[]>;
  objects(conn: DbConn, path: DbObjectPath): Promise<DbObject[]>;
  table(conn: DbConn, path: DbObjectPath, name: string): Promise<DbTableDetail>;
  /** 関数・列挙型の定義（ない種類は失敗にする） */
  definition(conn: DbConn, path: DbObjectPath, kind: "function" | "enum", name: string): Promise<DbDefinition>;
  outline(conn: DbConn, path: DbObjectPath): Promise<DbOutlineTable[]>;
  /** 行・数を読むときの FROM の名前（場所で修飾して囲んだもの） */
  tableRef(conn: DbConn, path: DbObjectPath, name: string): Promise<string>;
}
