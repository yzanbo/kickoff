// テーブルのデータの絞り込み（条件・WHERE の文）を SQL の WHERE 句にする（純粋な関数。ドライバと画面の「流す SQL」の見せ方で共通）
import type { DbEngine, DbFilter, DbFilterOp, DbRowFilter } from "@shared/database/types";
import { DB_DIALECTS, plainLike, quoteIdent } from "./dialect";

/** DB の種類ごとの書き方 */
export interface FilterDialect {
  /** 識別子を囲む */
  quote(name: string): string;
  /** n 番目（0 から）の値の置き場所（? / $1 …） */
  placeholder(n: number): string;
  /** 含む・始まるの比較（大文字と小文字を区別しない。PostgreSQL は ILIKE と文字列にする CAST） */
  like(column: string, not: boolean, param: string): string;
}

/** 種類の表から作る書き方（ドライバが使う。値の置き場所は 0 から数える） */
export function filterDialect(engine: DbEngine): FilterDialect {
  const d = DB_DIALECTS[engine];
  return { quote: d.quoteIdent, placeholder: (n) => d.placeholder(n + 1), like: d.like };
}

/** 値を使わない演算子 */
export const filterNeedsValue = (op: DbFilterOp) => op !== "is_null" && op !== "not_null";

const COMPARE: Partial<Record<DbFilterOp, string>> = { eq: "=", ne: "<>", lt: "<", gt: ">", le: "<=", ge: ">=" };

/** LIKE の中の % _ と、エスケープの印 ! を文字として扱う */
const escapeLike = (s: string) => s.replace(/[!%_]/g, (c) => `!${c}`);

/** 使える条件だけ（列の名前があり、値の要る演算子なら値がある。空の値の = は空文字を探すので残す） */
export const activeFilters = (filters: DbFilter[]) => filters.filter((f) => f.column.trim() !== "");

/**
 * 絞り込みを WHERE 句にする（なければ空）。値はすべて params で渡す（start は最初の値の番号）。
 * WHERE の文は改行で挟む（行末の -- のコメントが後ろの ORDER BY・LIMIT を消さないように）
 */
export function filterSql(filter: DbRowFilter, dialect: FilterDialect, start = 0): { clause: string; params: string[] } {
  if (filter.where !== null && filter.where.trim() !== "") return { clause: ` WHERE (\n${filter.where.trim()}\n)`, params: [] };
  const params: string[] = [];
  const next = (value: string) => {
    params.push(value);
    return dialect.placeholder(start + params.length - 1);
  };
  const parts = activeFilters(filter.filters).map((f) => {
    const col = dialect.quote(f.column);
    switch (f.op) {
      case "is_null":
        return `${col} IS NULL`;
      case "not_null":
        return `${col} IS NOT NULL`;
      case "contains":
        return dialect.like(col, false, next(`%${escapeLike(f.value)}%`));
      case "not_contains":
        return dialect.like(col, true, next(`%${escapeLike(f.value)}%`));
      case "starts":
        return dialect.like(col, false, next(`${escapeLike(f.value)}%`));
      default:
        return `${col} ${COMPARE[f.op]} ${next(f.value)}`;
    }
  });
  return { clause: parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

/** 絞り込みがないか */
export const isEmptyFilter = (filter: DbRowFilter) => (filter.where === null || filter.where.trim() === "") && activeFilters(filter.filters).length === 0;

/**
 * 画面に見せる、テーブルのデータを読む SQL（値は文字列の形で埋め、WHERE の文の改行は空白に。実際に流すものは値を params で渡す）。
 * from は FROM に書く名前（場所つきの名前にするとき。省けば table を囲んだもの）
 */
export function previewRowsSql(table: string, filter: DbRowFilter, sort: { column: string; desc: boolean }[], engine: DbEngine, limit: number, from?: string): string {
  const quote = (name: string) => quoteIdent(engine, name);
  const { clause, params } = filterSql(filter, { quote, placeholder: (n) => `\u0000${n}\u0000`, like: plainLike });
  const where = clause.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => DB_DIALECTS[engine].literal(params[Number(n)] ?? "")).replace(/\(\n|\n\)/g, (m) => (m === "(\n" ? "(" : ")"));
  const order = sort.length > 0 ? ` ORDER BY ${sort.map((s) => `${quote(s.column)}${s.desc ? " DESC" : ""}`).join(", ")}` : "";
  return `SELECT * FROM ${from ?? quote(table)}${where}${order} LIMIT ${limit}`;
}
