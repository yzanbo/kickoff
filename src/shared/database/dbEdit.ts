// テーブルの行の変更（段階 3 のセルの編集・行の追加と削除・CSV の取り込み）を SQL にする（純粋な関数。コアが流す文と、画面が見せる文で共通）
import type { DbEngine, DbKeyValue, DbObjectPath, DbRowEdit, DbTableDetail } from "../types";

/** DB に渡す値（数はそのまま。SQLite の型のない列でもキーが合うように） */
export type DbEditParam = string | number | null;

/** 流す 1 つの文（expect: 当たるはずの行の数。違えばすべて取り消す。追加は数えない = null） */
export interface DbEditStatement {
  sql: string;
  params: DbEditParam[];
  expect: number | null;
  /** 値をそのまま埋めた見せる文（確かめのダイアログ・SQL の履歴） */
  preview: string;
}

/** 識別子を囲む（MySQL は `…`、ほかは "…"。中の囲みの文字は 2 つにする） */
export function quoteName(engine: DbEngine, name: string): string {
  return engine === "mysql" ? `\`${name.replaceAll("`", "``")}\`` : `"${name.replaceAll('"', '""')}"`;
}

/** テーブルの場所つきの名前（PostgreSQL はスキーマ、MySQL は DB、SQLite は付け足した DB の名前） */
export function qualifiedTable(engine: DbEngine, path: DbObjectPath, table: string): string {
  const scope = engine === "postgres" ? path.schema : path.database;
  return scope ? `${quoteName(engine, scope)}.${quoteName(engine, table)}` : quoteName(engine, table);
}

/** キーの値を DB に渡す形にする（真偽は PostgreSQL なら true / false の文字、ほかは 1 / 0） */
export function editParam(engine: DbEngine, value: DbKeyValue): DbEditParam {
  if (typeof value === "boolean") return engine === "postgres" ? String(value) : value ? 1 : 0;
  return value;
}

/** 見せる文に埋める値（文字は ' で囲む） */
function literal(value: DbEditParam): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * 変更を文にする（並びは変更の順のまま。値はいつも params で渡し、見せる文には埋める）。
 * 更新は変えた列だけを SET し、キーで 1 行を指す（NULL のキーは IS NULL）。変える列のない更新は飛ばす
 */
export function editStatements(engine: DbEngine, path: DbObjectPath, table: string, edits: DbRowEdit[]): DbEditStatement[] {
  const target = qualifiedTable(engine, path, table);
  const q = (name: string) => quoteName(engine, name);
  const out: DbEditStatement[] = [];
  for (const edit of edits) {
    const params: DbEditParam[] = [];
    // 値の置き場所（params に足して ? / $n を返す）と、見せる文の値
    const put = (value: DbEditParam) => {
      params.push(value);
      return { sql: engine === "postgres" ? `$${params.length}` : "?", shown: literal(value) };
    };
    const where = (key: Record<string, DbKeyValue>) => {
      const parts = Object.entries(key).map(([col, raw]) => {
        const value = editParam(engine, raw);
        if (value === null) return { sql: `${q(col)} IS NULL`, shown: `${q(col)} IS NULL` };
        const p = put(value);
        return { sql: `${q(col)} = ${p.sql}`, shown: `${q(col)} = ${p.shown}` };
      });
      if (parts.length === 0) throw new Error("行を指すキーがありません");
      return { sql: parts.map((p) => p.sql).join(" AND "), shown: parts.map((p) => p.shown).join(" AND ") };
    };
    if (edit.kind === "update") {
      const cols = Object.entries(edit.values);
      if (cols.length === 0) continue;
      const sets = cols.map(([col, value]) => {
        const p = put(value);
        return { sql: `${q(col)} = ${p.sql}`, shown: `${q(col)} = ${p.shown}` };
      });
      const w = where(edit.key);
      out.push({
        sql: `UPDATE ${target} SET ${sets.map((s) => s.sql).join(", ")} WHERE ${w.sql}`,
        params,
        expect: 1,
        preview: `UPDATE ${target} SET ${sets.map((s) => s.shown).join(", ")} WHERE ${w.shown}`,
      });
    } else if (edit.kind === "delete") {
      const w = where(edit.key);
      out.push({ sql: `DELETE FROM ${target} WHERE ${w.sql}`, params, expect: 1, preview: `DELETE FROM ${target} WHERE ${w.shown}` });
    } else {
      const cols = Object.entries(edit.values);
      if (cols.length === 0) {
        const sql = engine === "mysql" ? `INSERT INTO ${target} () VALUES ()` : `INSERT INTO ${target} DEFAULT VALUES`;
        out.push({ sql, params, expect: null, preview: sql });
        continue;
      }
      const values = cols.map(([, value]) => put(value));
      const names = cols.map(([col]) => q(col)).join(", ");
      out.push({
        sql: `INSERT INTO ${target} (${names}) VALUES (${values.map((v) => v.sql).join(", ")})`,
        params,
        expect: null,
        preview: `INSERT INTO ${target} (${names}) VALUES (${values.map((v) => v.shown).join(", ")})`,
      });
    }
  }
  return out;
}

/**
 * 行を指すのに使う列（主キー → なければ NULL を許さない列だけの一意のインデックス。どちらもなければ null =
 * 更新・削除はできず、追加だけ）
 */
export function editKeyColumns(detail: Pick<DbTableDetail, "kind" | "columns" | "indexes">): string[] | null {
  if (detail.kind !== "table") return null;
  const pk = detail.columns.filter((c) => c.primary_key).map((c) => c.name);
  if (pk.length > 0) return pk;
  const notNull = new Set(detail.columns.filter((c) => !c.nullable).map((c) => c.name));
  const unique = detail.indexes.find((i) => i.unique && i.columns.length > 0 && i.columns.every((c) => notNull.has(c)));
  return unique ? unique.columns : null;
}
