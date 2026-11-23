// DB の種類ごとの違いの表（識別子・文字列の囲み・値の置き場所・DB の切り替え・文の止め方・字句の違い。既定のポートは types.ts の DB_DEFAULT_PORTS）。
// コア・ワーカー・画面は種類の if を書かずに、ここを引く（種類を足すときは表に 1 行）
import type { DbEngine, DbObjectPath } from "./types";

export interface DbDialect {
  /** 識別子を囲む（中の囲みの文字は 2 つにする） */
  quoteIdent(name: string): string;
  /** 文字列の値を囲む（' を 2 つにする。見せる文・DDL に埋めるときだけ。流す値はいつも params） */
  literal(value: string): string;
  /** n 番目（1 から）の値の置き場所（$1 / ?） */
  placeholder(n: number): string;
  /** 大文字・小文字を区別しない LIKE（含む・始まる。! でエスケープ。PostgreSQL は文字にしてから ILIKE） */
  like(column: string, not: boolean, param: string): string;
  /** 1 つの接続が DB 1 つにつなぐ（PostgreSQL。DB を替えるには接続を作り直す） */
  databasePerConnection: boolean;
  /** 同じ接続の中で DB を切り替える文（MySQL。なければ null） */
  useDatabase: ((name: string) => string) | null;
  /** テーブルの場所にスキーマの段を使う（PostgreSQL。ほかは DB の名前で指す） */
  hasSchemas: boolean;
  /** 文を止める方法（別の接続から止める / ワーカーごと止める = SQLite は文を流している間ワーカーが受け取れない） */
  cancel: "side_connection" | "kill_worker";
  /** 真偽の値を DB に渡す形（PostgreSQL は "true" / "false"、ほかは 1 / 0） */
  boolParam(value: boolean): string | number;
  /** 列を書かずに 1 行足す文 */
  insertDefaults(table: string): string;
  /** 字句の違い（sqlStatements の分け方と判定が引く） */
  lexical: {
    /** # から行末までがコメント */
    hashComment: boolean;
    /** -- は後ろに空白（か終わり）があるときだけコメント（1--1 は引き算） */
    dashNeedsSpace: boolean;
    /** 文字列の中の \ は次の文字を囲む */
    backslashInStrings: boolean;
    /** "…" は文字列（ほかは識別子） */
    doubleQuoteIsString: boolean;
    /** 囲むコメントは入れ子にできる */
    nestedComments: boolean;
    /** E'…' は \ で囲む文字列 */
    escapeStrings: boolean;
    /** $$ … $$ / $tag$ … $tag$ は文字列 */
    dollarQuote: boolean;
    /** […] は識別子 */
    bracketIdent: boolean;
    /** 版つきの実行されるコメント（MariaDB の M 付きも）は中身を文として読む（コメントとして捨てると INTO OUTFILE・DROP が素通りする） */
    versionComment: boolean;
    /** CREATE TRIGGER の BEGIN … END の中の ; で文を分けない */
    triggerBlocks: boolean;
    /** PRAGMA を読み取りの文として判定できる */
    pragma: boolean;
  };
}

const doubleQuoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
const backQuoted = (name: string) => `\`${name.replaceAll("`", "``")}\``;
const singleQuoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
/** LIKE の比較（SQLite・MySQL。ASCII は大文字と小文字を区別しない） */
export const plainLike = (column: string, not: boolean, param: string) => `${column} ${not ? "NOT LIKE" : "LIKE"} ${param} ESCAPE '!'`;
const NO_LEXICAL: DbDialect["lexical"] = {
  hashComment: false,
  dashNeedsSpace: false,
  backslashInStrings: false,
  doubleQuoteIsString: false,
  nestedComments: false,
  escapeStrings: false,
  dollarQuote: false,
  bracketIdent: false,
  versionComment: false,
  triggerBlocks: false,
  pragma: false,
};

export const DB_DIALECTS: Record<DbEngine, DbDialect> = {
  sqlite: {
    quoteIdent: doubleQuoted,
    literal: singleQuoted,
    placeholder: () => "?",
    like: plainLike,
    databasePerConnection: false,
    useDatabase: null,
    hasSchemas: false,
    cancel: "kill_worker",
    boolParam: (value) => (value ? 1 : 0),
    insertDefaults: (table) => `INSERT INTO ${table} DEFAULT VALUES`,
    lexical: { ...NO_LEXICAL, bracketIdent: true, triggerBlocks: true, pragma: true },
  },
  postgres: {
    quoteIdent: doubleQuoted,
    literal: singleQuoted,
    placeholder: (n) => `$${n}`,
    like: (column, not, param) => `CAST(${column} AS text) ${not ? "NOT ILIKE" : "ILIKE"} ${param} ESCAPE '!'`,
    databasePerConnection: true,
    useDatabase: null,
    hasSchemas: true,
    cancel: "side_connection",
    boolParam: (value) => String(value),
    insertDefaults: (table) => `INSERT INTO ${table} DEFAULT VALUES`,
    lexical: { ...NO_LEXICAL, nestedComments: true, escapeStrings: true, dollarQuote: true },
  },
  mysql: {
    quoteIdent: backQuoted,
    literal: singleQuoted,
    placeholder: () => "?",
    like: plainLike,
    databasePerConnection: false,
    useDatabase: (name) => `USE ${backQuoted(name)}`,
    hasSchemas: false,
    cancel: "side_connection",
    boolParam: (value) => (value ? 1 : 0),
    insertDefaults: (table) => `INSERT INTO ${table} () VALUES ()`,
    lexical: { ...NO_LEXICAL, hashComment: true, dashNeedsSpace: true, backslashInStrings: true, doubleQuoteIsString: true, versionComment: true, triggerBlocks: true },
  },
};

/** 識別子を囲む */
export const quoteIdent = (engine: DbEngine, name: string): string => DB_DIALECTS[engine].quoteIdent(name);

/** テーブルの場所つきの名前（PostgreSQL はスキーマ、MySQL は DB、SQLite は付け足した DB の名前。なければ名前だけ） */
export function qualifiedTable(engine: DbEngine, path: DbObjectPath, table: string): string {
  const scope = DB_DIALECTS[engine].hasSchemas ? path.schema : path.database;
  return scope ? `${quoteIdent(engine, scope)}.${quoteIdent(engine, table)}` : quoteIdent(engine, table);
}
