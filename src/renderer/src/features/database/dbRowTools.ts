// テーブルのデータの補助（セルの値で絞る・外部キーで移る条件・行の詳細の値の整え方・CSV / TSV / JSON の書き出し）。React に依らない
import { DB_IMAGE_PREVIEW_BYTES, type DbColumnInfo, type DbFilter, type DbForeignKey, type DbTableDetail, type DbValue } from "@shared/types";
import { dbImageType, isDbBinary, isDbLongText } from "@shared/database/dbValue";
import { EMPTY_TEXT_LABEL } from "./dbFormat";

/** 絞り込みの値にする文（NULL は null、バイナリ・頭だけの長い文字は絞れないので undefined） */
export function filterValueOf(value: DbValue): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "object") return undefined;
  return String(value);
}

/** セルの「この値で絞る / 除く」の条件（NULL は NULL / NULL でない。バイナリは絞れないので null） */
export function valueFilter(column: string, value: DbValue, exclude: boolean): DbFilter | null {
  const v = filterValueOf(value);
  if (v === undefined) return null;
  if (v === null) return { column, op: exclude ? "not_null" : "is_null", value: "" };
  return { column, op: exclude ? "ne" : "eq", value: v };
}

/**
 * 行の値から、つながった行を探す条件（from の列の値 → to の列。外部キーで参照先へ移るときは from = fk.columns・to = fk.ref_columns、
 * 指されている行を探すときは逆）。値が NULL・バイナリ・列がなければ null（つながりがない）
 */
export function linkFilters(row: DbValue[], columns: DbColumnInfo[], from: string[], to: string[]): DbFilter[] | null {
  const filters: DbFilter[] = [];
  for (let i = 0; i < from.length; i++) {
    const at = columns.findIndex((c) => c.name === from[i]);
    if (at < 0 || !to[i]) return null;
    const v = filterValueOf(row[at]);
    if (v === null || v === undefined) return null;
    filters.push({ column: to[i], op: "eq", value: v });
  }
  return filters.length > 0 ? filters : null;
}

/** 頭だけの長い文字を含む行か */
export const hasLongValue = (row: DbValue[]) => row.some(isDbLongText);

/** まだ縮小表示の中身（data_url）を読んでいない、大きすぎない画像のバイナリを含む行か */
export const hasUnreadImage = (row: DbValue[]) => row.some((v) => isDbBinary(v) && !v.data_url && v.bytes <= DB_IMAGE_PREVIEW_BYTES && dbImageType(v.head) !== null);

/** 行を指すキーの列の条件（全体を読み直すとき。キーの列がない・値がバイナリや頭だけの文字なら null） */
export function rowKeyFilters(columns: DbColumnInfo[], row: DbValue[], keyColumns: string[] | null): DbFilter[] | null {
  if (!keyColumns || keyColumns.length === 0) return null;
  const filters: DbFilter[] = [];
  for (const name of keyColumns) {
    const at = columns.findIndex((c) => c.name === name);
    if (at < 0) return null;
    const v = filterValueOf(row[at]);
    if (v === undefined) return null;
    filters.push(v === null ? { column: name, op: "is_null", value: "" } : { column: name, op: "eq", value: v });
  }
  return filters;
}

/** 列 → その列を含む外部キー（セルの右クリック・行の詳細で参照先へ移る） */
export function foreignKeysByColumn(fks: DbForeignKey[]): Map<string, DbForeignKey[]> {
  const map = new Map<string, DbForeignKey[]>();
  for (const fk of fks) for (const c of fk.columns) map.set(c, [...(map.get(c) ?? []), fk]);
  return map;
}

/** 行の詳細で見せる値（JSON の文字列は整えて、空文字は「（空文字）」と分かるように。頭だけの長い文字は頭と「…」） */
export function detailText(value: DbValue): { text: string; kind: "null" | "binary" | "long" | "json" | "empty" | "text" } {
  if (value === null) return { text: "NULL", kind: "null" };
  if (isDbLongText(value)) return { text: `${value.head}…`, kind: "long" };
  if (typeof value === "object") return { text: `${value.bytes.toLocaleString()} バイト\n${value.head}${value.bytes > value.head.length / 2 ? "…" : ""}`, kind: "binary" };
  const text = String(value);
  if (text === "") return { text: EMPTY_TEXT_LABEL, kind: "empty" };
  if (/^\s*[[{]/.test(text)) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== null && typeof parsed === "object") return { text: JSON.stringify(parsed, null, 2), kind: "json" };
    } catch {
      // JSON でなければそのまま
    }
  }
  return { text, kind: "text" };
}

/** 書き出しの形 */
export const DB_EXPORT_FORMATS = ["csv", "tsv", "json"] as const;
export type DbExportFormat = (typeof DB_EXPORT_FORMATS)[number];

/** 書き出すときのセルの文（NULL は空、バイナリは 16 進の頭に \x。頭だけの長い文字は頭。書き出す前に全体を取っておく） */
const exportCell = (value: DbValue) => (value === null ? "" : isDbBinary(value) ? `\\x${value.head}` : isDbLongText(value) ? value.head : String(value));

/** CSV（区切りや " や改行を含むセルは " で囲み、" は 2 つに）・TSV（タブ・改行は空白に） */
function delimited(columns: DbColumnInfo[], rows: DbValue[][], format: "csv" | "tsv"): string {
  const cell = (s: string) => (format === "tsv" ? s.replace(/[\t\r\n]+/g, " ") : /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const sep = format === "csv" ? "," : "\t";
  return [columns.map((c) => cell(c.name)), ...rows.map((r) => r.map((v) => cell(exportCell(v))))].map((line) => line.join(sep)).join("\n") + "\n";
}

/** 読み込んだ行を書き出す文（JSON は列の名前をキーにしたオブジェクトの配列。バイナリは { binary, bytes, head } のまま） */
export function exportRows(columns: DbColumnInfo[], rows: DbValue[][], format: DbExportFormat): string {
  if (format !== "json") return delimited(columns, rows, format);
  return JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i] ?? null]))), null, 2) + "\n";
}

export const DB_EXPORT_TYPES: Record<DbExportFormat, string> = { csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json" };

/** 表の見出しに出す列のキー（主キーの列と、外部キーの列 → 参照先「テーブル.列」） */
export interface ColumnKeys {
  primary: ReadonlySet<string>;
  foreign: ReadonlyMap<string, string>;
}

/** テーブルの詳細から、見出しに出す列のキーを作る（外部キーは foreignKeysByColumn の最初のもの。複数の列の外部キーは、その列に対応する参照先の列） */
export function columnKeysOf(detail: Pick<DbTableDetail, "columns" | "foreign_keys">): ColumnKeys {
  const primary = new Set(detail.columns.filter((c) => c.primary_key).map((c) => c.name));
  const foreign = new Map<string, string>();
  for (const [col, [fk]] of foreignKeysByColumn(detail.foreign_keys)) {
    const table = fk.ref_schema ? `${fk.ref_schema}.${fk.ref_table}` : fk.ref_table;
    foreign.set(col, `${table}.${fk.ref_columns[fk.columns.indexOf(col)] ?? fk.ref_columns[0] ?? ""}`);
  }
  return { primary, foreign };
}
